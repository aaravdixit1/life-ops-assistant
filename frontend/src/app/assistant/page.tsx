"use client";

import React, { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Bot,
  Sparkles,
  Send,
  Calendar,
  Clock,
  MapPin,
  Check,
  Plus,
  Trash2,
  BookOpen,
  ArrowLeft,
  Database,
  X,
  RefreshCw,
  ExternalLink,
  ChevronRight,
  Info,
  Search,
  Edit3,
  Save,
  Coffee,
  GraduationCap,
  Moon,
  Sliders,
  FileText,
  PlusCircle,
  Eye,
  AlertCircle,
  MessageSquare,
  History,
  PanelLeftClose,
  PanelLeftOpen,
} from "lucide-react";
import {
  sendDirectLineMessage,
  commitAssistantEvent,
  createUserKnowledge,
  getUserKnowledge,
  updateUserKnowledge,
  deleteUserKnowledge,
  approveAction,
  rejectAction,
  getAssistantSessions,
  getAssistantSession,
  deleteAssistantSession,
  type AssistantSessionSummary,
} from "@/lib/api";
import { AssignmentDetailModal, AcademicAssignment } from "@/components/academics/assignment-modal";
import { EventDetailModal } from "@/components/calendar/event-modals";
import { FormattedMarkdown } from "@/components/ui/formatted-content";
import { ThemedSelect } from "@/components/ui/themed-select";
import { useProfile } from "@/components/profile-provider";

function formatClock24to12(raw?: string | null, fallback = "8:30 AM"): string {
  if (!raw) return fallback;
  const match = raw.trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return raw;
  let hour = Number(match[1]);
  const minute = match[2];
  const suffix = hour >= 12 ? "PM" : "AM";
  hour = hour % 12 || 12;
  return `${hour}:${minute} ${suffix}`;
}

interface Message {
  id: string;
  sender: "user" | "assistant";
  text: string;
  timestamp: string;
  proposed_event?: {
    summary: string;
    date: string;
    start_time: string;
    end_time: string;
    formatted_time?: string;
    location?: string;
    description?: string;
    color?: string;
    source?: string;
    committed?: boolean;
    committing?: boolean;
    commit_error?: string;
  };
  recommendations?: Array<{
    title: string;
    author?: string;
    category?: string;
    reason?: string;
    added?: boolean;
    adding?: boolean;
  }>;
  mentioned_assignments?: Array<{
    id: string;
    course_name?: string;
    title: string;
    description?: string;
    due_at?: string | null;
    formatted_due?: string;
    due_label?: string;
    is_due_today?: boolean;
    is_overdue?: boolean;
    is_submitted?: boolean;
    submission_status?: string;
    is_tentative?: boolean;
    syllabus_notes?: string;
  }>;
  mentioned_events?: Array<{
    id: string;
    summary: string;
    date: string;
    start_time: string;
    end_time: string;
    formatted_time?: string;
    location?: string;
    description?: string;
    source?: string;
    calendar_name?: string;
  }>;
  saved_facts?: Array<{
    id?: string;
    category: string;
    title: string;
    content: string;
    deleted?: boolean;
  }>;
  action_staged?: {
    action_id: string;
    action_type: string;
    summary: string;
    date?: string;
    time?: string;
    location?: string;
    count?: number;
    diff_preview?: any;
    resolved?: "approved" | "rejected";
    resolving?: boolean;
  };
  deleted_events?: Array<{
    summary: string;
    start_time?: string;
    end_time?: string;
  }>;
  deleted_count?: number;
}

const LAST_SESSION_STORAGE_KEY = "lifeops_last_assistant_session_id";

function buildWelcomeText(firstName: string): string {
  const hr = typeof window !== "undefined" ? new Date().getHours() : 12;
  const salutation = hr < 12 ? "Good morning" : hr < 17 ? "Good afternoon" : "Good evening";
  return `${salutation}, ${firstName}. How can I help with your Life-Ops workspace today?\n\nAsk me about your **Canvas assignments**, **upcoming calendar schedule**, **health macros & groceries**, or ask me to **draft a new appointment or study block**.`;
}

function hydrateSessionMessages(detail: any): Message[] {
  const rawList = Array.isArray(detail?.messages) ? detail.messages : [];
  return rawList.map((m: any) => {
    const p = m.payload || {};
    let recs = Array.isArray(p.recommendations)
      ? p.recommendations.map((r: any) => ({ ...r, added: false }))
      : [];
    if (recs.length === 0 && p.curated_reading) {
      recs.push({
        title: p.curated_reading.title,
        author: p.curated_reading.author,
        category: p.curated_reading.tag || "Philosophy & Fiction",
        reason: p.curated_reading.note,
        added: false,
      });
    }
    const tsLabel = m.created_at
      ? new Date(m.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
      : "Saved";
    return {
      id: String(m.id),
      sender: m.role === "user" ? "user" : "assistant",
      text: m.content || "",
      timestamp: tsLabel,
      proposed_event: p.proposed_event || undefined,
      action_staged: p.action_staged || undefined,
      deleted_events: p.deleted_events || undefined,
      recommendations: recs.length > 0 ? recs : undefined,
      saved_facts: Array.isArray(p.saved_facts)
        ? p.saved_facts.map((f: any) => ({ ...f, deleted: false }))
        : undefined,
      mentioned_assignments: p.mentioned_assignments || undefined,
      mentioned_events: p.mentioned_events || undefined,
      deleted_count: p.deleted_count,
    } as Message;
  });
}

function cleanPreviewText(raw: string): string {
  if (!raw) return "";
  return raw
    .replace(/^\s{0,3}#{1,6}\s+/gm, "")
    .replace(/^\s*[-*•]\s+/gm, "")
    .replace(/\*\*/g, "")
    .replace(/__/g, "")
    .replace(/`/g, "")
    .replace(/(^|\s)\*|\*(\s|$)/g, "$1$2")
    .replace(/\s+/g, " ")
    .trim();
}

export default function AssistantPage() {
  const router = useRouter();
  const { profile, firstName, studySanctuary, academicProfile } = useProfile();
  const [referrerLabel, setReferrerLabel] = useState("Back");

  const [sessions, setSessions] = useState<AssistantSessionSummary[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [sessionsLoading, setSessionsLoading] = useState(true);
  const [mobileHistoryOpen, setMobileHistoryOpen] = useState(false);
  const [desktopHistoryOpen, setDesktopHistoryOpen] = useState(true);

  useEffect(() => {
    try {
      if (localStorage.getItem("lifeops-assistant-history-open:v1") === "false") {
        setDesktopHistoryOpen(false);
      }
    } catch {
      // ignore
    }
  }, []);

  const toggleDesktopHistory = (next?: boolean) => {
    setDesktopHistoryOpen((prev) => {
      const resolved = typeof next === "boolean" ? next : !prev;
      try {
        localStorage.setItem("lifeops-assistant-history-open:v1", resolved ? "true" : "false");
      } catch {
        // ignore
      }
      return resolved;
    });
  };

  const [messages, setMessages] = useState<Message[]>([
    {
      id: "initial-greeting",
      sender: "assistant",
      text: `Hi ${firstName}. How can I help with your Life-Ops workspace today?\n\nAsk me about your **Canvas assignments**, **upcoming calendar schedule**, **health macros & groceries**, or ask me to **draft a new appointment or study block**.`,
      timestamp: "Today",
    },
  ]);

  useEffect(() => {
    setMessages((prev) => {
      if (prev.length === 1 && prev[0].id === "initial-greeting") {
        const nextText = buildWelcomeText(firstName);
        if (prev[0].text === nextText) return prev;
        return [{ ...prev[0], text: nextText }];
      }
      return prev;
    });
  }, [firstName]);

  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [memoryDrawerOpen, setMemoryDrawerOpen] = useState(false);
  const [knowledgeItems, setKnowledgeItems] = useState<any[]>([]);
  const [knowledgeLoading, setKnowledgeLoading] = useState(false);
  const [activeCategoryFilter, setActiveCategoryFilter] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");

  // Modals for pop-outs
  const [selectedAssignment, setSelectedAssignment] = useState<AcademicAssignment | null>(null);
  const [isAssignmentModalOpen, setIsAssignmentModalOpen] = useState(false);
  const [selectedEvent, setSelectedEvent] = useState<any | null>(null);
  const [isEventModalOpen, setIsEventModalOpen] = useState(false);

  // Adding memory state
  const [isAddingFact, setIsAddingFact] = useState(false);
  const [newFact, setNewFact] = useState({
    category: "profile",
    title: "",
    content: "",
    author: "",
  });
  const [addFactLoading, setAddFactLoading] = useState(false);

  // Editing memory state
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({
    category: "",
    title: "",
    content: "",
  });
  const [editLoading, setEditLoading] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Smart back navigation detection
  useEffect(() => {
    if (typeof document !== "undefined" && document.referrer) {
      try {
        const refUrl = new URL(document.referrer);
        if (refUrl.pathname.includes("/schedule")) setReferrerLabel("Schedule");
        else if (refUrl.pathname.includes("/academics")) setReferrerLabel("Academics");
        else if (refUrl.pathname.includes("/brief")) setReferrerLabel("Daily Brief");
        else if (refUrl.pathname === "/") setReferrerLabel("Dashboard");
        else setReferrerLabel("Back");
      } catch {
        setReferrerLabel("Back");
      }
    }
  }, []);

  const handleBack = () => {
    if (typeof window !== "undefined" && window.history.length > 1) {
      router.back();
    } else {
      router.push("/brief");
    }
  };

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, loading]);

  // Load knowledge base items
  const loadKnowledge = async () => {
    setKnowledgeLoading(true);
    try {
      const data = await getUserKnowledge();
      setKnowledgeItems(data || []);
    } catch (e) {
      console.error("Failed to load knowledge base:", e);
    } finally {
      setKnowledgeLoading(false);
    }
  };

  const loadSessions = async (): Promise<AssistantSessionSummary[]> => {
    try {
      const list = await getAssistantSessions();
      const safe = Array.isArray(list) ? list : [];
      setSessions(safe);
      return safe;
    } catch (e) {
      console.error("Failed to load chat logs:", e);
      return [];
    } finally {
      setSessionsLoading(false);
    }
  };

  const handleSelectSession = async (sessionId: string) => {
    setMobileHistoryOpen(false);
    try {
      const detail = await getAssistantSession(sessionId);
      setActiveSessionId(detail.id);
      if (typeof window !== "undefined") {
        localStorage.setItem(LAST_SESSION_STORAGE_KEY, detail.id);
      }
      const hydrated = hydrateSessionMessages(detail);
      setMessages(
        hydrated.length > 0
          ? hydrated
          : [
              {
                id: "initial-greeting",
                sender: "assistant",
                text: buildWelcomeText(firstName),
                timestamp: "Today",
              },
            ]
      );
    } catch (e) {
      console.error("Failed to load selected chat session:", e);
    }
  };

  const handleNewChat = () => {
    setMobileHistoryOpen(false);
    setActiveSessionId(null);
    if (typeof window !== "undefined") {
      localStorage.removeItem(LAST_SESSION_STORAGE_KEY);
    }
    setMessages([
      {
        id: "initial-greeting",
        sender: "assistant",
        text: buildWelcomeText(firstName),
        timestamp: "Today",
      },
    ]);
    inputRef.current?.focus();
  };

  const handleDeleteSession = async (sessionId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await deleteAssistantSession(sessionId);
      const updated = sessions.filter((s) => s.id !== sessionId);
      setSessions(updated);
      if (activeSessionId === sessionId) {
        if (updated.length > 0) {
          await handleSelectSession(updated[0].id);
        } else {
          handleNewChat();
        }
      }
    } catch (err) {
      console.error("Failed to delete chat session:", err);
    }
  };

  useEffect(() => {
    loadKnowledge();
    (async () => {
      const list = await loadSessions();
      if (list.length > 0) {
        const lastId =
          typeof window !== "undefined" ? localStorage.getItem(LAST_SESSION_STORAGE_KEY) : null;
        const target = (lastId && list.find((s) => s.id === lastId)) || list[0];
        if (target) {
          await handleSelectSession(target.id);
        }
      }
    })();

    const handleRefresh = () => loadKnowledge();
    window.addEventListener("lifeops-refresh-calendar", handleRefresh);
    window.addEventListener("lifeops-profile-updated", handleRefresh);
    return () => {
      window.removeEventListener("lifeops-refresh-calendar", handleRefresh);
      window.removeEventListener("lifeops-profile-updated", handleRefresh);
    };
  }, []);

  const handleSendMessage = async (textToSend?: string) => {
    const query = (textToSend || input).trim();
    if (!query || loading) return;

    const userMsg: Message = {
      id: `user-${Date.now()}`,
      sender: "user",
      text: query,
      timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    };

    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setLoading(true);

    try {
      // Pass recent turns + active session_id so backend persists conversation & pulls context
      const historyPayload = messages.slice(-8).map((m) => ({
        role: m.sender,
        content: m.text,
      }));

      const res = await sendDirectLineMessage(query, undefined, historyPayload, activeSessionId);
      if (res?.session_id) {
        setActiveSessionId(res.session_id);
        if (typeof window !== "undefined") {
          localStorage.setItem(LAST_SESSION_STORAGE_KEY, res.session_id);
        }
      }

      // If recommendations are empty but curated_reading was returned, surface it as a recommendation card
      let recs = res.recommendations?.map((r: any) => ({ ...r, added: false })) || [];
      if (recs.length === 0 && res.curated_reading) {
        recs.push({
          title: res.curated_reading.title,
          author: res.curated_reading.author,
          category: res.curated_reading.tag || "Philosophy & Fiction",
          reason: res.curated_reading.note,
          added: false,
        });
      }

      const assistantMsg: Message = {
        id: `asst-${Date.now()}`,
        sender: "assistant",
        text: res.message || "I've processed your thought.",
        timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
        proposed_event: res.proposed_event,
        action_staged: res.action_staged,
        deleted_events: res.deleted_events,
        recommendations: recs.length > 0 ? recs : undefined,
        saved_facts: res.saved_facts?.map((f: any) => ({ ...f, deleted: false })),
        mentioned_assignments: res.mentioned_assignments,
        mentioned_events: res.mentioned_events,
        deleted_count: res.deleted_count,
      };

      setMessages((prev) => [...prev, assistantMsg]);
      await loadSessions();
      // Refresh drawer knowledge items if changes occurred
      if ((res.saved_facts && res.saved_facts.length > 0) || (res.deleted_count && res.deleted_count > 0)) {
        loadKnowledge();
      }
    } catch (e: any) {
      setMessages((prev) => [
        ...prev,
        {
          id: `asst-err-${Date.now()}`,
          sender: "assistant",
          text: "I encountered a hiccup processing that request. Please try again.",
          timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  // Commit proposed calendar event
  const handleCommitEvent = async (msgId: string, eventData: any) => {
    setMessages((prev) =>
      prev.map((m) =>
        m.id === msgId && m.proposed_event
          ? { ...m, proposed_event: { ...m.proposed_event, committing: true, commit_error: undefined } }
          : m
      )
    );

    try {
      await commitAssistantEvent({
        summary: eventData.summary,
        start_time: eventData.start_time,
        end_time: eventData.end_time,
        location: eventData.location,
        description: eventData.description,
        color: eventData.color || "#d97706",
        source: ["life_ops_study_block", "life_ops_manual", "external", "canvas_inferred"].includes(eventData.source)
          ? eventData.source
          : "life_ops_study_block",
      });

      setMessages((prev) =>
        prev.map((m) =>
          m.id === msgId && m.proposed_event
            ? { ...m, proposed_event: { ...m.proposed_event, committing: false, committed: true } }
            : m
        )
      );
      window.dispatchEvent(new Event("lifeops-refresh-calendar"));
    } catch (err: any) {
      setMessages((prev) =>
        prev.map((m) =>
          m.id === msgId && m.proposed_event
            ? {
                ...m,
                proposed_event: {
                  ...m.proposed_event,
                  committing: false,
                  commit_error: err?.message || "Failed to commit event",
                },
              }
            : m
        )
      );
    }
  };

  // Approve staged calendar modification (e.g. drop course or remove class session)
  const handleApproveStagedAction = async (msgId: string, actionId: string) => {
    setMessages((prev) =>
      prev.map((m) =>
        m.id === msgId && m.action_staged
          ? { ...m, action_staged: { ...m.action_staged, resolving: true } }
          : m
      )
    );

    try {
      await approveAction(actionId);
      setMessages((prev) =>
        prev.map((m) =>
          m.id === msgId && m.action_staged
            ? { ...m, action_staged: { ...m.action_staged, resolving: false, resolved: "approved" } }
            : m
        )
      );
    } catch (err: any) {
      alert(`Failed to approve action: ${err?.message || "Unknown error"}`);
      setMessages((prev) =>
        prev.map((m) =>
          m.id === msgId && m.action_staged
            ? { ...m, action_staged: { ...m.action_staged, resolving: false } }
            : m
        )
      );
    }
  };

  // Reject staged calendar modification
  const handleRejectStagedAction = async (msgId: string, actionId: string) => {
    setMessages((prev) =>
      prev.map((m) =>
        m.id === msgId && m.action_staged
          ? { ...m, action_staged: { ...m.action_staged, resolving: true } }
          : m
      )
    );

    try {
      await rejectAction(actionId);
      setMessages((prev) =>
        prev.map((m) =>
          m.id === msgId && m.action_staged
            ? { ...m, action_staged: { ...m.action_staged, resolving: false, resolved: "rejected" } }
            : m
        )
      );
    } catch (err: any) {
      alert(`Failed to reject action: ${err?.message || "Unknown error"}`);
      setMessages((prev) =>
        prev.map((m) =>
          m.id === msgId && m.action_staged
            ? { ...m, action_staged: { ...m.action_staged, resolving: false } }
            : m
        )
      );
    }
  };

  // Add recommended book to reading list
  const handleAddBook = async (msgId: string, bookIdx: number, book: any) => {
    setMessages((prev) =>
      prev.map((m) => {
        if (m.id === msgId && m.recommendations) {
          const recs = [...m.recommendations];
          recs[bookIdx] = { ...recs[bookIdx], adding: true };
          return { ...m, recommendations: recs };
        }
        return m;
      })
    );

    try {
      await createUserKnowledge({
        category: "reading_list",
        title: book.title,
        content: book.reason || book.note || "Curated literary recommendation.",
        metadata: {
          author: book.author,
          category: book.category,
        },
      });

      setMessages((prev) =>
        prev.map((m) => {
          if (m.id === msgId && m.recommendations) {
            const recs = [...m.recommendations];
            recs[bookIdx] = { ...recs[bookIdx], adding: false, added: true };
            return { ...m, recommendations: recs };
          }
          return m;
        })
      );
      loadKnowledge();
    } catch (e) {
      setMessages((prev) =>
        prev.map((m) => {
          if (m.id === msgId && m.recommendations) {
            const recs = [...m.recommendations];
            recs[bookIdx] = { ...recs[bookIdx], adding: false };
            return { ...m, recommendations: recs };
          }
          return m;
        })
      );
    }
  };

  // Delete saved fact from message card
  const handleDeleteFact = async (msgId: string, factIdx: number, factId?: string) => {
    if (!factId) return;
    try {
      await deleteUserKnowledge(factId);
      setMessages((prev) =>
        prev.map((m) => {
          if (m.id === msgId && m.saved_facts) {
            const facts = [...m.saved_facts];
            facts[factIdx] = { ...facts[factIdx], deleted: true };
            return { ...m, saved_facts: facts };
          }
          return m;
        })
      );
      loadKnowledge();
    } catch (e) {
      console.error(e);
    }
  };

  // Create new fact directly from Knowledge Vault
  const handleCreateFact = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newFact.title.trim() || addFactLoading) return;
    setAddFactLoading(true);
    try {
      await createUserKnowledge({
        category: newFact.category,
        title: newFact.title.trim(),
        content: newFact.content.trim(),
        metadata: newFact.author ? { author: newFact.author.trim() } : {},
      });
      setNewFact({ category: "profile", title: "", content: "", author: "" });
      setIsAddingFact(false);
      await loadKnowledge();
    } catch (err) {
      console.error("Failed to create knowledge fact:", err);
    } finally {
      setAddFactLoading(false);
    }
  };

  // Trigger inline edit
  const startEditing = (item: any) => {
    setEditingItemId(item.id);
    setEditForm({
      category: item.category,
      title: item.title,
      content: item.content || "",
    });
  };

  // Save inline edit
  const handleSaveEdit = async (itemId: string) => {
    if (!editForm.title.trim() || editLoading) return;
    setEditLoading(true);
    try {
      await updateUserKnowledge(itemId, {
        category: editForm.category,
        title: editForm.title.trim(),
        content: editForm.content.trim(),
      });
      setEditingItemId(null);
      await loadKnowledge();
    } catch (err) {
      console.error("Failed to update knowledge:", err);
    } finally {
      setEditLoading(false);
    }
  };

  // Format simple markdown into JSX
  const renderFormattedText = (rawText: string) => {
    const lines = rawText.split("\n");
    return (
      <div className="space-y-2 leading-relaxed">
        {lines.map((line, idx) => {
          if (!line.trim()) return <div key={idx} className="h-1.5" />;

          // Bullet point
          if (line.trim().startsWith("- ") || line.trim().startsWith("• ")) {
            const itemText = line.trim().replace(/^[-•]\s*/, "");
            return (
              <div key={idx} className="flex items-start gap-2 pl-2">
                <span className="text-[var(--accent-primary)] mt-1">•</span>
                <span>{parseInlineStyles(itemText)}</span>
              </div>
            );
          }

          // Numbered point
          if (/^\d+\.\s/.test(line.trim())) {
            return (
              <div key={idx} className="pl-2">
                {parseInlineStyles(line)}
              </div>
            );
          }

          return <p key={idx}>{parseInlineStyles(line)}</p>;
        })}
      </div>
    );
  };

  const parseInlineStyles = (str: string) => {
    const parts = str.split(/(\*\*.*?\*\*|\*.*?\*)/g);
    return parts.map((part, i) => {
      if (part.startsWith("**") && part.endsWith("**")) {
        return (
          <strong key={i} className="font-semibold text-[var(--text-primary)]">
            {part.slice(2, -2)}
          </strong>
        );
      }
      if (part.startsWith("*") && part.endsWith("*")) {
        return (
          <em key={i} className="italic text-[var(--accent-primary)]">
            {part.slice(1, -1)}
          </em>
        );
      }
      return part;
    });
  };

  const quickPrompts = [
    "What assignments do I have due today?",
    "Can you add a dentist appointment tomorrow at 2 PM to my calendar?",
    "What is on my schedule this week?",
    "Schedule a 2-hour focus sprint today at 4 PM",
  ];

  // Category counts
  const countProfile = knowledgeItems.filter(
    (k) => k.category === "profile" || k.category === "personal_fact"
  ).length;
  const countCadence = knowledgeItems.filter(
    (k) => k.category === "cadence" || k.category === "habit" || k.category === "routine"
  ).length;
  const countReading = knowledgeItems.filter((k) => k.category === "reading_list").length;
  const countPreference = knowledgeItems.filter((k) => k.category === "preference").length;
  const countNotes = knowledgeItems.filter(
    (k) => k.category === "note" || k.category === "scratchpad"
  ).length;

  // Filtered knowledge items
  const filteredKnowledge = knowledgeItems.filter((item) => {
    const cat = item.category?.toLowerCase() || "";
    const matchesCategory =
      activeCategoryFilter === "all" ||
      (activeCategoryFilter === "profile" && (cat === "profile" || cat === "personal_fact")) ||
      (activeCategoryFilter === "cadence" && (cat === "cadence" || cat === "habit" || cat === "routine")) ||
      (activeCategoryFilter === "reading_list" && (cat === "reading_list" || cat === "reading")) ||
      (activeCategoryFilter === "preference" && cat === "preference") ||
      (activeCategoryFilter === "note" && (cat === "note" || cat === "scratchpad"));

    if (!matchesCategory) return false;

    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    const t = (item.title || "").toLowerCase();
    const c = (item.content || "").toLowerCase();
    const a = (item.metadata?.author || "").toLowerCase();
    return t.includes(q) || c.includes(q) || a.includes(q);
  });

  // Key facts for Executive Dossier Top Bar
  const residenceFact = knowledgeItems.find(
    (k) => k.title.toLowerCase().includes("residence") || k.title.toLowerCase().includes("address")
  );
  const programFact = knowledgeItems.find(
    (k) => k.title.toLowerCase().includes("academic") || k.title.toLowerCase().includes("program") || k.title.toLowerCase().includes("major")
  );
  const sleepFact = knowledgeItems.find(
    (k) => k.title.toLowerCase().includes("sleep") || k.title.toLowerCase().includes("circadian") || k.title.toLowerCase().includes("wake")
  );
  const sanctuaryFact = knowledgeItems.find(
    (k) =>
      k.title.toLowerCase().includes("sanctuary") ||
      k.title.toLowerCase().includes("coffee") ||
      k.title.toLowerCase().includes("cafe") ||
      k.title.toLowerCase().includes("study")
  );
  const readingFact = knowledgeItems.find((k) => k.category === "reading_list");

  const openVaultWithFilter = (cat: string) => {
    setActiveCategoryFilter(cat);
    setMemoryDrawerOpen(true);
  };

  return (
    <div className="flex h-[calc(100vh-3.5rem)] max-w-6xl mx-auto w-full px-3 sm:px-6 pt-3 pb-4 gap-4">
      {/* Desktop Chat Logs Rail */}
      {desktopHistoryOpen && (
        <aside className="hidden lg:flex w-64 shrink-0 flex-col rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-elevated)] overflow-hidden">
          <div className="p-3 border-b border-[var(--border-hairline)] flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-[var(--text-primary)]">
              <History className="w-3.5 h-3.5 text-[var(--accent-primary)]" />
              <span>Chat Logs</span>
            </div>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={handleNewChat}
                className="px-2.5 py-1 rounded-md text-[11px] font-semibold bg-[var(--accent-primary)] text-stone-950 hover:opacity-90 transition-opacity flex items-center gap-1 cursor-pointer"
              >
                <Plus className="w-3 h-3" />
                <span>New Chat</span>
              </button>
              <button
                type="button"
                onClick={() => toggleDesktopHistory(false)}
                aria-label="Close chat logs"
                title="Hide chat logs"
                className="p-1 rounded-md text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-surface)] transition-colors cursor-pointer"
              >
                <PanelLeftClose className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {sessionsLoading ? (
            <div className="p-3 text-xs text-[var(--text-muted)]">Loading chat logs...</div>
          ) : sessions.length === 0 ? (
            <div className="p-3 text-xs text-[var(--text-muted)] leading-relaxed">
              Conversations you start are automatically saved here for cross-session recall.
            </div>
          ) : (
            sessions.map((sess) => {
              const isActive = sess.id === activeSessionId;
              return (
                <div
                  key={sess.id}
                  onClick={() => handleSelectSession(sess.id)}
                  className={`group flex items-start justify-between gap-2 px-2.5 py-2 rounded-lg text-xs cursor-pointer border transition-colors ${
                    isActive
                      ? "bg-[var(--bg-surface)] border-[var(--accent-primary)]/45 text-[var(--text-primary)]"
                      : "border-transparent hover:bg-[var(--bg-surface)]/60 text-[var(--text-secondary)]"
                  }`}
                >
                  <div className="min-w-0 flex-1 space-y-0.5">
                    <div className="flex items-center gap-1.5">
                      <MessageSquare className="w-3 h-3 text-[var(--accent-primary)] shrink-0" />
                      <span className="font-medium truncate">{sess.title}</span>
                    </div>
                    <p className="text-[10px] text-[var(--text-muted)] truncate pl-4.5">
                      {sess.message_count} msg{sess.message_count === 1 ? "" : "s"}
                      {sess.preview ? ` · ${cleanPreviewText(sess.preview)}` : ""}
                    </p>
                  </div>
                  <button
                    type="button"
                    aria-label={`Delete chat ${sess.title}`}
                    title="Delete conversation"
                    onClick={(e) => handleDeleteSession(sess.id, e)}
                    className="p-1 rounded text-[var(--text-muted)] hover:text-[var(--semantic-danger)] hover:bg-[var(--bg-base)] opacity-70 group-hover:opacity-100 transition-opacity shrink-0 cursor-pointer"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              );
            })
          )}
          </div>
        </aside>
      )}

      {/* Main Conversation Column */}
      <div className="flex-1 flex flex-col min-w-0">
      {/* Top Header Bar */}
      <header className="flex items-center justify-between pb-3 mb-2 border-b border-[var(--border-hairline)] shrink-0">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={handleBack}
            className="flex items-center gap-1.5 text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors py-1 px-2.5 rounded-md hover:bg-[var(--bg-surface)] cursor-pointer"
            title="Return to previous page"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span className="font-sans font-medium">{referrerLabel}</span>
          </button>
          <div className="h-4 w-px bg-[var(--border-hairline)]" />
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-[var(--accent-primary)]/15 border border-[var(--accent-primary)]/30 flex items-center justify-center text-[var(--accent-primary)]">
              <Bot className="w-4 h-4" />
            </div>
            <div>
              <h1 className="text-sm font-semibold tracking-tight text-[var(--text-primary)] font-sans">
                Life-Ops Assistant
              </h1>
              <p className="text-[11px] text-[var(--text-muted)] font-sans hidden sm:block">
                Personal knowledge, saved chat logs &amp; calendar scheduling
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Desktop Chat Logs Reopen Toggle when Collapsed */}
          {!desktopHistoryOpen && (
            <button
              type="button"
              onClick={() => toggleDesktopHistory(true)}
              aria-label="Open chat logs"
              title="Show chat logs"
              className="hidden lg:flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-surface)] hover:border-[var(--accent-primary)]/50 text-xs text-[var(--text-primary)] cursor-pointer transition-colors"
            >
              <PanelLeftOpen className="w-3.5 h-3.5 text-[var(--accent-primary)]" />
              <span>Chats ({sessions.length})</span>
            </button>
          )}

          {/* Mobile Chat Logs Toggle */}
          <button
            type="button"
            onClick={() => setMobileHistoryOpen(true)}
            className="lg:hidden flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-surface)] text-xs text-[var(--text-primary)] cursor-pointer"
          >
            <History className="w-3.5 h-3.5 text-[var(--accent-primary)]" />
            <span>Chats ({sessions.length})</span>
          </button>

          {/* New Chat quick button on small/tablet screens */}
          <button
            type="button"
            onClick={handleNewChat}
            className="lg:hidden flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-[var(--accent-primary)] text-stone-950 text-xs font-semibold cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>New</span>
          </button>

          {/* Knowledge Memory Toggle Button */}
          <button
            type="button"
            onClick={() => setMemoryDrawerOpen(true)}
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-surface)] hover:border-[var(--accent-primary)]/50 text-xs font-sans text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-all cursor-pointer shadow-xs group"
          >
            <Database className="w-3.5 h-3.5 text-[var(--accent-primary)] shrink-0 transition-transform group-hover:scale-105" />
            <span className="text-xs font-medium text-[var(--text-primary)]">Memory Vault</span>
            <span className="inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full bg-[var(--accent-primary)]/15 text-[var(--accent-primary)] text-[10px] font-mono font-bold border border-[var(--accent-primary)]/30 leading-none">
              {knowledgeItems.length}
            </span>
          </button>
        </div>
      </header>

      {/* EXECUTIVE DOSSIER QUICK-CHIPS BAR */}
      <section className="mb-3 py-1.5 px-2 rounded-xl border border-[var(--border-hairline)]/70 bg-[var(--bg-surface)]/40 flex items-center gap-2 overflow-x-auto no-scrollbar shrink-0 text-micro">
        <span className="text-[10px] font-mono uppercase tracking-wider text-[var(--text-muted)] shrink-0 flex items-center gap-1 font-semibold pl-1">
          <Sparkles className="w-3 h-3 text-[var(--accent-primary)]" />
          <span>Dossier:</span>
        </span>

        {residenceFact && (
          <button
            type="button"
            onClick={() => openVaultWithFilter("profile")}
            className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-[var(--bg-base)] border border-[var(--border-hairline)] hover:border-[var(--accent-primary)]/60 text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors duration-75 active:scale-[0.98] shrink-0 cursor-pointer"
            title="Click to view residence in Knowledge Vault"
          >
            <MapPin className="w-3 h-3 text-sky-400" />
            <span className="truncate max-w-[140px] sm:max-w-none">
              {residenceFact.content.replace("Lives at ", "")}
            </span>
          </button>
        )}

        {(sleepFact || profile?.wake_time) && (
          <button
            type="button"
            onClick={() => openVaultWithFilter("cadence")}
            className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-[var(--bg-base)] border border-[var(--border-hairline)] hover:border-[var(--accent-primary)]/60 text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors duration-75 active:scale-[0.98] shrink-0 cursor-pointer"
            title="Click to view sleep schedule in Knowledge Vault"
          >
            <Moon className="w-3 h-3 text-amber-400" />
            <span>
              {formatClock24to12(profile?.wake_time, "8:30 AM")} Wake ·{" "}
              {formatClock24to12(profile?.sleep_time, "11:30 PM")} Sleep
            </span>
          </button>
        )}

        {(sanctuaryFact || profile?.study_sanctuary) && (
          <button
            type="button"
            onClick={() => openVaultWithFilter("cadence")}
            className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-[var(--bg-base)] border border-[var(--border-hairline)] hover:border-[var(--accent-primary)]/60 text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors duration-75 active:scale-[0.98] shrink-0 cursor-pointer"
            title="Click to view study sanctuary in Knowledge Vault"
          >
            <Coffee className="w-3 h-3 text-amber-500" />
            <span>{studySanctuary}</span>
          </button>
        )}

        {readingFact && (
          <button
            type="button"
            onClick={() => openVaultWithFilter("reading_list")}
            className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-[var(--bg-base)] border border-[var(--border-hairline)] hover:border-[var(--accent-primary)]/60 text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors duration-75 active:scale-[0.98] shrink-0 cursor-pointer"
            title="Click to view reading shelf in Knowledge Vault"
          >
            <BookOpen className="w-3 h-3 text-emerald-400" />
            <span>{readingFact.title}</span>
          </button>
        )}

        {(programFact || profile?.institution || profile?.major_or_role) && (
          <button
            type="button"
            onClick={() => openVaultWithFilter("profile")}
            className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-[var(--bg-base)] border border-[var(--border-hairline)] hover:border-[var(--accent-primary)]/60 text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors duration-75 active:scale-[0.98] shrink-0 cursor-pointer hidden md:flex"
            title="Click to view academic profile in Knowledge Vault"
          >
            <GraduationCap className="w-3 h-3 text-indigo-400" />
            <span>
              {[profile?.institution, profile?.major_or_role].filter(Boolean).join(" · ") ||
                academicProfile}
            </span>
          </button>
        )}
      </section>

      {/* Main Conversation Stream */}
      <div className="flex-1 overflow-y-auto space-y-4 pr-1 sm:pr-2">
        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`flex flex-col ${
              msg.sender === "user" ? "items-end" : "items-start"
            } space-y-2 max-w-3xl ${msg.sender === "user" ? "ml-auto" : "mr-auto"} w-full`}
          >
            {/* Sender tag & Timestamp */}
            <div className="flex items-center gap-2 px-1 text-[11px] text-[var(--text-muted)] font-mono">
              {msg.sender === "assistant" ? (
                <>
                  <Sparkles className="w-3 h-3 text-[var(--accent-primary)]" />
                  <span className="text-[var(--accent-primary)] font-sans font-medium">Assistant</span>
                </>
              ) : (
                <span className="text-[var(--text-secondary)] font-sans font-medium">{firstName}</span>
              )}
              <span>·</span>
              <span>{msg.timestamp}</span>
            </div>

            {/* Bubble */}
            <div
              className={`rounded-2xl p-4 text-xs sm:text-sm font-sans ${
                msg.sender === "user"
                  ? "bg-[var(--accent-primary)]/15 border border-[var(--accent-primary)]/35 text-[var(--text-primary)] rounded-tr-xs"
                  : "bg-[var(--bg-surface)]/85 border border-[var(--border-hairline)] text-[var(--text-primary)] rounded-tl-xs shadow-xs"
              }`}
            >
              <FormattedMarkdown content={msg.text} />

              {/* INTERACTIVE COMPONENT 1: REFERENCED ACADEMIC DELIVERABLES */}
              {msg.mentioned_assignments && msg.mentioned_assignments.length > 0 && (
                <div className="mt-4 pt-3 border-t border-[var(--border-hairline)] space-y-2.5">
                  <div className="flex items-center justify-between text-xs text-[var(--text-muted)]">
                    <span className="uppercase tracking-wider text-[10px] font-mono text-[var(--accent-primary)] font-semibold flex items-center gap-1.5">
                      <GraduationCap className="w-3.5 h-3.5" />
                      <span>Referenced Academic Deliverable</span>
                    </span>
                    <span className="text-micro font-mono text-[var(--text-muted)]">
                      Canvas Verified
                    </span>
                  </div>

                  <div className="space-y-2">
                    {msg.mentioned_assignments.map((hw) => {
                      const cleanTitle = hw.title
                        .replace(/\s*\[.*?\]\s*/g, "")
                        .replace(/\s*\(.*?\)\s*/g, "")
                        .trim();
                      const course = (hw.course_name || academicProfile)
                        .replace(/[[\]]/g, "")
                        .replace(/_/g, " ")
                        .trim();

                      return (
                        <div
                          key={hw.id}
                          className="p-3.5 rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-base)] space-y-2.5 hover:border-[var(--accent-primary)]/40 transition-all shadow-xs"
                        >
                          <div className="flex items-start justify-between gap-2 flex-wrap">
                            <div className="flex items-center gap-2">
                              <span className="px-2 py-0.5 rounded text-micro font-mono font-semibold uppercase tracking-wider bg-[var(--accent-primary)]/15 text-[var(--accent-primary)] border border-[var(--accent-primary)]/30">
                                {course}
                              </span>
                              {hw.is_submitted ? (
                                <span className="px-2 py-0.5 rounded text-micro font-medium bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 flex items-center gap-1">
                                  <Check className="w-3 h-3" />
                                  <span>Submitted</span>
                                </span>
                              ) : (
                                <span
                                  className={`px-2 py-0.5 rounded text-micro font-medium border flex items-center gap-1 ${
                                    hw.is_overdue
                                      ? "bg-rose-500/15 text-rose-300 border-rose-500/30"
                                      : "bg-amber-500/15 text-amber-300 border-amber-500/30"
                                  }`}
                                >
                                  <Clock className="w-3 h-3" />
                                  <span>{hw.due_label || hw.formatted_due || "Active Task"}</span>
                                </span>
                              )}
                            </div>

                            <span className="text-micro font-mono text-[var(--text-muted)]">
                              {hw.formatted_due}
                            </span>
                          </div>

                          <h4
                            className="text-base font-semibold text-[var(--text-primary)] font-serif italic leading-snug"
                            style={{ fontFamily: "var(--font-serif)" }}
                          >
                            {cleanTitle}
                          </h4>

                          <div className="flex items-center gap-2 pt-1">
                            <button
                              type="button"
                              onClick={() => {
                                setSelectedAssignment(hw as any);
                                setIsAssignmentModalOpen(true);
                              }}
                              className="flex-1 py-1.5 px-3 rounded-lg text-xs font-semibold bg-[var(--accent-primary)] text-stone-950 hover:opacity-95 transition-opacity flex items-center justify-center gap-1.5 cursor-pointer shadow-xs"
                            >
                              <FileText className="w-3.5 h-3.5" />
                              <span>Inspect Spec (Pop-out)</span>
                            </button>

                            <button
                              type="button"
                              onClick={() => {
                                handleSendMessage(`Schedule a 2-hour study block for ${cleanTitle} today`);
                              }}
                              className="py-1.5 px-3 rounded-lg text-xs font-medium border border-[var(--border-hairline)] bg-[var(--bg-surface)] hover:border-[var(--accent-primary)]/50 text-[var(--text-primary)] transition-all flex items-center gap-1.5 cursor-pointer"
                            >
                              <Calendar className="w-3.5 h-3.5 text-[var(--accent-primary)]" />
                              <span className="hidden sm:inline">Schedule Block</span>
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* INTERACTIVE COMPONENT 2: REFERENCED CALENDAR EVENTS */}
              {msg.mentioned_events && msg.mentioned_events.length > 0 && (
                <div className="mt-4 pt-3 border-t border-[var(--border-hairline)] space-y-2.5">
                  <div className="flex items-center justify-between text-xs text-[var(--text-muted)]">
                    <span className="uppercase tracking-wider text-[10px] font-mono text-[var(--accent-primary)] font-semibold flex items-center gap-1.5">
                      <Calendar className="w-3.5 h-3.5" />
                      <span>Referenced Calendar Event</span>
                    </span>
                    <span className="text-micro font-mono text-[var(--text-muted)]">
                      Live Schedule
                    </span>
                  </div>

                  <div className="space-y-2">
                    {msg.mentioned_events.map((ev) => (
                      <div
                        key={ev.id}
                        className="p-3 rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-base)] flex items-center justify-between gap-3 hover:border-[var(--accent-primary)]/40 transition-all shadow-xs"
                      >
                        <div className="space-y-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-micro font-mono text-[var(--accent-primary)] bg-[var(--accent-primary)]/10 px-2 py-0.5 rounded font-semibold">
                              {ev.formatted_time}
                            </span>
                            {ev.location && (
                              <span className="text-micro text-[var(--text-muted)] flex items-center gap-1">
                                <MapPin className="w-3 h-3 text-[var(--accent-primary)]" />
                                <span>{ev.location}</span>
                              </span>
                            )}
                          </div>
                          <h5 className="font-semibold text-xs text-[var(--text-primary)] font-sans truncate">
                            {ev.summary}
                          </h5>
                        </div>

                        <button
                          type="button"
                          onClick={() => {
                            setSelectedEvent(ev);
                            setIsEventModalOpen(true);
                          }}
                          className="py-1 px-3 rounded-lg text-micro font-medium border border-[var(--border-hairline)] bg-[var(--bg-surface)] hover:bg-[var(--accent-primary)] hover:text-stone-950 text-[var(--text-secondary)] transition-all cursor-pointer shrink-0"
                        >
                          Pop-out
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* INTERACTIVE COMPONENT 3: PROPOSED CALENDAR EVENT */}
              {msg.proposed_event && (
                <div className="mt-4 pt-3 border-t border-[var(--border-hairline)] space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[10px] uppercase tracking-wider font-mono px-2 py-0.5 rounded bg-[var(--accent-primary)]/15 text-[var(--accent-primary)] border border-[var(--accent-primary)]/30 flex items-center gap-1">
                      <Calendar className="w-3 h-3" />
                      Proposed Calendar Event
                    </span>
                    <span className="text-[11px] text-[var(--text-muted)] font-mono">
                      {msg.proposed_event.date}
                    </span>
                  </div>

                  <div className="p-3.5 rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-base)] space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <h4 className="font-semibold text-sm text-[var(--text-primary)] font-sans">
                        {msg.proposed_event.summary}
                      </h4>
                      <span className="text-micro font-mono text-[var(--accent-primary)] bg-[var(--accent-primary)]/10 px-2 py-0.5 rounded shrink-0">
                        {msg.proposed_event.formatted_time || "Scheduled Time"}
                      </span>
                    </div>

                    {msg.proposed_event.location && (
                      <div className="flex items-center gap-1.5 text-xs text-[var(--text-muted)]">
                        <MapPin className="w-3.5 h-3.5 text-[var(--accent-primary)] shrink-0" />
                        <span>{msg.proposed_event.location}</span>
                      </div>
                    )}

                    {msg.proposed_event.description && (
                      <p className="text-xs text-[var(--text-secondary)] italic leading-relaxed pt-1">
                        {msg.proposed_event.description}
                      </p>
                    )}

                    <div className="pt-2">
                      {msg.proposed_event.committed ? (
                        <div className="w-full py-2 px-3 rounded-lg bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 text-xs font-medium flex items-center justify-center gap-2">
                          <Check className="w-4 h-4" />
                          <span>Added to Live Calendar · 1-click Undo available in Autopilot Logs</span>
                        </div>
                      ) : (
                        <button
                          type="button"
                          disabled={msg.proposed_event.committing}
                          onClick={() => handleCommitEvent(msg.id, msg.proposed_event)}
                          className="w-full py-2 px-3 rounded-lg bg-[var(--accent-primary)] text-stone-950 font-semibold text-xs hover:opacity-95 transition-opacity flex items-center justify-center gap-2 cursor-pointer shadow-xs disabled:opacity-50"
                        >
                          {msg.proposed_event.committing ? (
                            <>
                              <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                              <span>Adding to Calendar...</span>
                            </>
                          ) : (
                            <>
                              <Calendar className="w-3.5 h-3.5" />
                              <span>Add this to Calendar</span>
                            </>
                          )}
                        </button>
                      )}
                      {msg.proposed_event.commit_error && (
                        <p className="text-red-400 text-micro mt-1 text-center font-mono">
                          {msg.proposed_event.commit_error}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* INTERACTIVE COMPONENT: STAGED ACTION / CALENDAR REMOVAL CONFIRMATION */}
              {msg.action_staged && (
                <div className="mt-4 pt-3 border-t border-[var(--border-hairline)] space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[10px] uppercase tracking-wider font-mono px-2 py-0.5 rounded bg-[var(--semantic-warning)]/15 text-[var(--semantic-warning)] border border-[var(--semantic-warning)]/30 flex items-center gap-1 font-semibold">
                      <AlertCircle className="w-3 h-3" />
                      Confirmation Required
                    </span>
                    <span className="text-[11px] text-[var(--text-muted)] font-mono">
                      {msg.action_staged.date || "Today"}
                    </span>
                  </div>

                  <div className="p-3.5 rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-base)] space-y-2.5">
                    <div className="flex items-start justify-between gap-2">
                      <h4 className="font-semibold text-sm text-[var(--text-primary)] font-sans">
                        {msg.action_staged.summary}
                      </h4>
                      {msg.action_staged.time && (
                        <span className="text-micro font-mono text-[var(--semantic-warning)] bg-[var(--semantic-warning)]/10 px-2 py-0.5 rounded shrink-0">
                          {msg.action_staged.time}
                        </span>
                      )}
                    </div>

                    {msg.action_staged.location && (
                      <div className="flex items-center gap-1.5 text-xs text-[var(--text-muted)]">
                        <MapPin className="w-3.5 h-3.5 text-[var(--accent-primary)] shrink-0" />
                        <span>{msg.action_staged.location}</span>
                      </div>
                    )}

                    <p className="text-xs text-[var(--text-muted)] leading-relaxed pt-0.5">
                      Per your safety guardrails, modifying fixed academic courses requires explicit confirmation. 1-click Undo rollback will be recorded upon removal.
                    </p>

                    <div className="pt-2">
                      {msg.action_staged.resolved === "approved" ? (
                        <div className="w-full py-2 px-3 rounded-lg bg-[var(--semantic-success)]/15 border border-[var(--semantic-success)]/30 text-[var(--semantic-success)] text-xs font-medium flex items-center justify-center gap-2">
                          <Check className="w-4 h-4" />
                          <span>Removed from calendar · 1-click Undo recorded in Autopilot</span>
                        </div>
                      ) : msg.action_staged.resolved === "rejected" ? (
                        <div className="w-full py-2 px-3 rounded-lg bg-[var(--bg-surface)] border border-[var(--border-hairline)] text-[var(--text-muted)] text-xs font-medium flex items-center justify-center gap-2">
                          <X className="w-4 h-4" />
                          <span>Proposal cancelled · Kept on calendar</span>
                        </div>
                      ) : (
                        <div className="flex items-center justify-end gap-2 pt-1 border-t border-[var(--border-hairline)]">
                          <button
                            type="button"
                            disabled={msg.action_staged.resolving}
                            onClick={() => handleRejectStagedAction(msg.id, msg.action_staged!.action_id)}
                            className="px-3 py-1.5 text-xs font-medium rounded-lg border border-[var(--border-hairline)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-surface)] font-sans transition-colors cursor-pointer"
                          >
                            Keep on Calendar
                          </button>
                          <button
                            type="button"
                            disabled={msg.action_staged.resolving}
                            onClick={() => handleApproveStagedAction(msg.id, msg.action_staged!.action_id)}
                            className="flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold rounded-lg bg-[var(--semantic-danger)] text-white hover:opacity-90 font-sans transition-opacity cursor-pointer shadow-xs disabled:opacity-50"
                          >
                            {msg.action_staged.resolving ? (
                              <>
                                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                                <span>Removing...</span>
                              </>
                            ) : (
                              <>
                                <Trash2 className="w-3.5 h-3.5" />
                                <span>Confirm &amp; Remove</span>
                              </>
                            )}
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* INTERACTIVE COMPONENT: AUTO-REMOVED STUDY BLOCK */}
              {msg.deleted_events && msg.deleted_events.length > 0 && (
                <div className="mt-3 p-3 rounded-xl border border-[var(--semantic-success)]/30 bg-[var(--semantic-success)]/10 text-xs text-[var(--semantic-success)] flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Check className="w-4 h-4 shrink-0" />
                    <span>Auto-removed <strong>{msg.deleted_events[0].summary}</strong> from your schedule for today.</span>
                  </div>
                  <span className="font-mono text-micro opacity-80">1-click Undo available</span>
                </div>
              )}

              {/* INTERACTIVE COMPONENT 4: BOOK RECOMMENDATIONS */}
              {msg.recommendations && msg.recommendations.length > 0 && (
                <div className="mt-4 pt-3 border-t border-[var(--border-hairline)] space-y-3">
                  <div className="flex items-center justify-between text-xs text-[var(--text-muted)]">
                    <span className="uppercase tracking-wider text-[10px] font-mono text-[var(--accent-primary)] font-medium">
                      Curated Literary Recommendations
                    </span>
                    <span className="text-[11px] text-[var(--text-muted)] font-mono">
                      Personal Shelf Tailored
                    </span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    {msg.recommendations.map((book, bIdx) => (
                      <div
                        key={bIdx}
                        className="p-3 rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-base)] flex flex-col justify-between gap-2.5 hover:border-[var(--accent-primary)]/40 transition-colors"
                      >
                        <div className="space-y-1">
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-[9px] uppercase tracking-wider font-mono px-1.5 py-0.5 rounded bg-[var(--accent-primary)]/15 text-[var(--accent-primary)]">
                              {book.category || "Book"}
                            </span>
                            <span className="text-micro text-[var(--text-muted)] truncate">
                              {book.author}
                            </span>
                          </div>
                          <h5
                            className="font-serif italic text-sm text-[var(--text-primary)]"
                            style={{ fontFamily: "var(--font-serif)" }}
                          >
                            {book.title}
                          </h5>
                          <p className="text-micro text-[var(--text-secondary)] line-clamp-3 leading-relaxed">
                            {book.reason}
                          </p>
                        </div>

                        <button
                          type="button"
                          disabled={book.added || book.adding}
                          onClick={() => handleAddBook(msg.id, bIdx, book)}
                          className={`w-full py-1.5 px-2 rounded-lg text-micro font-medium transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                            book.added
                              ? "bg-emerald-500/15 text-emerald-400 border border-emerald-500/30"
                              : "bg-[var(--bg-surface)] hover:bg-[var(--accent-primary)] hover:text-stone-950 text-[var(--text-primary)] border border-[var(--border-hairline)]"
                          }`}
                        >
                          {book.adding ? (
                            <RefreshCw className="w-3 h-3 animate-spin" />
                          ) : book.added ? (
                            <>
                              <Check className="w-3 h-3" />
                              <span>In Reading List</span>
                            </>
                          ) : (
                            <>
                              <Plus className="w-3 h-3" />
                              <span>Add to Reading List</span>
                            </>
                          )}
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* INTERACTIVE COMPONENT 5: SAVED MEMORY / FACTS */}
              {msg.saved_facts && msg.saved_facts.length > 0 && (
                <div className="mt-4 pt-3 border-t border-[var(--border-hairline)] space-y-2">
                  <span className="text-[10px] uppercase tracking-wider font-mono text-[var(--accent-primary)] font-medium">
                    ✦ Saved to Long-Term Memory
                  </span>
                  <div className="space-y-1.5">
                    {msg.saved_facts.map((fact, fIdx) => (
                      <div
                        key={fIdx}
                        className={`p-2.5 rounded-lg border text-xs flex items-center justify-between gap-3 ${
                          fact.deleted
                            ? "opacity-40 border-[var(--border-hairline)] bg-[var(--bg-base)] line-through"
                            : "border-[var(--accent-primary)]/30 bg-[var(--accent-primary)]/10 text-[var(--text-primary)]"
                        }`}
                      >
                        <div className="space-y-0.5 min-w-0">
                          <span className="text-[10px] font-mono uppercase tracking-wider text-[var(--accent-primary)] font-semibold block">
                            {fact.title}
                          </span>
                          <p className="text-xs text-[var(--text-primary)] font-sans truncate">
                            {fact.content}
                          </p>
                        </div>
                        {!fact.deleted && fact.id && (
                          <button
                            type="button"
                            onClick={() => handleDeleteFact(msg.id, fIdx, fact.id)}
                            title="Remove from memory"
                            className="p-1 text-[var(--text-muted)] hover:text-red-400 hover:bg-red-400/10 rounded transition-colors cursor-pointer shrink-0"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Notice of deleted items */}
              {msg.deleted_count !== undefined && msg.deleted_count > 0 && (
                <div className="mt-3 pt-2 text-micro text-[var(--text-muted)] font-mono flex items-center gap-1.5">
                  <Check className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Removed {msg.deleted_count} item(s) from knowledge base.</span>
                </div>
              )}
            </div>
          </div>
        ))}

        {loading && (
          <div className="flex items-center gap-2 p-3 rounded-xl bg-[var(--bg-surface)]/60 border border-[var(--border-hairline)] text-xs text-[var(--text-muted)] w-fit font-sans">
            <RefreshCw className="w-3.5 h-3.5 animate-spin text-[var(--accent-primary)]" />
            <span>Consulting memory & horizons...</span>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Quick Prompt Ideas */}
      <div className="py-2 flex items-center gap-1.5 overflow-x-auto no-scrollbar shrink-0 text-micro">
        <span className="text-[var(--text-muted)] shrink-0 font-mono">Prompts:</span>
        {quickPrompts.map((chip, i) => (
          <button
            key={i}
            type="button"
            onClick={() => handleSendMessage(chip)}
            className="px-2.5 py-1 rounded-full border border-[var(--border-hairline)] bg-[var(--bg-surface)]/80 hover:border-[var(--accent-primary)] hover:text-[var(--text-primary)] text-[var(--text-secondary)] whitespace-nowrap transition-colors cursor-pointer shrink-0 font-sans"
          >
            {chip}
          </button>
        ))}
      </div>

      {/* Input Form Bar */}
      <footer className="pt-2 shrink-0">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleSendMessage();
          }}
          className="relative flex items-center rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-surface)] focus-within:border-[var(--accent-primary)] transition-all p-1.5 shadow-sm"
        >
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask your assistant anything, tell it facts to remember, or schedule study sessions..."
            className="flex-1 px-3 py-2 text-xs sm:text-sm bg-transparent text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-hidden font-sans"
          />
          <button
            type="submit"
            disabled={loading || !input.trim()}
            className="px-3.5 py-2 rounded-lg text-xs font-semibold bg-[var(--accent-primary)] text-stone-950 hover:opacity-90 transition-opacity flex items-center gap-1.5 cursor-pointer disabled:opacity-40 shrink-0 font-sans shadow-xs"
          >
            <span>{loading ? "Thinking..." : "Send"}</span>
            <Send className="w-3 h-3" />
          </button>
        </form>
      </footer>
      </div>

      {/* Mobile Chat Logs Drawer */}
      {mobileHistoryOpen && (
        <div
          onClick={() => setMobileHistoryOpen(false)}
          className="fixed inset-0 z-50 bg-black/60 flex justify-start lg:hidden"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-72 bg-[var(--bg-base)] border-r border-[var(--border-hairline)] h-full flex flex-col shadow-2xl"
          >
            <div className="p-3.5 border-b border-[var(--border-hairline)] flex items-center justify-between">
              <div className="flex items-center gap-2 text-xs font-semibold text-[var(--text-primary)]">
                <History className="w-4 h-4 text-[var(--accent-primary)]" />
                <span>Saved Chat Logs</span>
              </div>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={handleNewChat}
                  className="px-2 py-1 rounded text-[11px] font-semibold bg-[var(--accent-primary)] text-stone-950 cursor-pointer"
                >
                  + New
                </button>
                <button
                  type="button"
                  onClick={() => setMobileHistoryOpen(false)}
                  className="p-1 text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto p-2 space-y-1">
              {sessions.map((sess) => (
                <div
                  key={sess.id}
                  onClick={() => handleSelectSession(sess.id)}
                  className={`flex items-center justify-between gap-2 px-3 py-2 rounded-lg text-xs cursor-pointer ${
                    sess.id === activeSessionId
                      ? "bg-[var(--bg-surface)] text-[var(--text-primary)] font-medium"
                      : "text-[var(--text-secondary)] hover:bg-[var(--bg-surface)]/50"
                  }`}
                >
                  <span className="truncate flex-1">{sess.title}</span>
                  <button
                    type="button"
                    aria-label={`Delete chat ${sess.title}`}
                    onClick={(e) => handleDeleteSession(sess.id, e)}
                    className="p-1 text-[var(--text-muted)] hover:text-[var(--semantic-danger)] shrink-0"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* -------------------------------------------------------------------------- */}
      {/* FULL KNOWLEDGE VAULT & MEMORY DRAWER                                      */}
      {/* -------------------------------------------------------------------------- */}
      {memoryDrawerOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 flex justify-end">
          <div className="w-full max-w-lg bg-[var(--bg-base)] border-l border-[var(--border-hairline)] h-full flex flex-col shadow-2xl">
            {/* Drawer Header */}
            <div className="p-4 border-b border-[var(--border-hairline)] flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Database className="w-4 h-4 text-[var(--accent-primary)]" />
                <div>
                  <h3 className="font-semibold text-sm text-[var(--text-primary)] font-sans">
                    Memory Vault
                  </h3>
                  <p className="text-micro text-[var(--text-muted)] font-mono">
                    {knowledgeItems.length} stored facts
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setIsAddingFact((prev) => !prev)}
                  className={`flex items-center gap-1 text-xs py-1 px-2.5 rounded-lg border transition-all cursor-pointer font-sans ${
                    isAddingFact
                      ? "bg-[var(--accent-primary)] text-stone-950 font-semibold border-transparent"
                      : "bg-[var(--bg-surface)] text-[var(--accent-primary)] border-[var(--accent-primary)]/40 hover:bg-[var(--accent-primary)]/15"
                  }`}
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>{isAddingFact ? "Cancel" : "Add Fact"}</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setMemoryDrawerOpen(false);
                    setIsAddingFact(false);
                    setEditingItemId(null);
                  }}
                  className="p-1 text-[var(--text-muted)] hover:text-[var(--text-primary)] rounded-md hover:bg-[var(--bg-surface)] cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Quick-Add Memory Panel */}
            {isAddingFact && (
              <form
                onSubmit={handleCreateFact}
                className="p-3.5 border-b border-[var(--border-hairline)] bg-[var(--bg-surface)]/70 space-y-2.5 animate-in slide-in-from-top-2 duration-150"
              >
                <div className="flex items-center justify-between text-xs font-semibold text-[var(--text-primary)]">
                  <span className="flex items-center gap-1.5 font-sans">
                    <PlusCircle className="w-3.5 h-3.5 text-[var(--accent-primary)]" />
                    New Life-Ops Fact / Memory
                  </span>
                  <span className="text-micro text-[var(--text-muted)] font-mono">
                    Direct Postgres + RAG Index
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-micro text-[var(--text-muted)] block mb-1 font-mono">
                      Domain
                    </label>
                    <ThemedSelect
                      value={newFact.category}
                      onChange={(e) => setNewFact({ ...newFact, category: e.target.value })}
                      selectClassName="p-1.5 rounded-lg"
                    >
                      <option value="profile">Personal Profile</option>
                      <option value="cadence">Daily Cadence</option>
                      <option value="reading_list">Reading Shelf</option>
                      <option value="preference">Preference</option>
                      <option value="note">Active Note</option>
                    </ThemedSelect>
                  </div>
                  <div>
                    <label className="text-micro text-[var(--text-muted)] block mb-1 font-mono">
                      Title
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. Apartment Unit"
                      value={newFact.title}
                      onChange={(e) => setNewFact({ ...newFact, title: e.target.value })}
                      className="w-full text-xs bg-[var(--bg-base)] border border-[var(--border-hairline)] rounded-lg p-1.5 text-[var(--text-primary)] focus:outline-hidden"
                      required
                    />
                  </div>
                </div>

                <div>
                  <label className="text-micro text-[var(--text-muted)] block mb-1 font-mono">
                    Details / Content
                  </label>
                  <textarea
                    rows={2}
                    placeholder="Enter the exact fact or details to remember..."
                    value={newFact.content}
                    onChange={(e) => setNewFact({ ...newFact, content: e.target.value })}
                    className="w-full text-xs bg-[var(--bg-base)] border border-[var(--border-hairline)] rounded-lg p-1.5 text-[var(--text-primary)] focus:outline-hidden resize-none"
                  />
                </div>

                {newFact.category === "reading_list" && (
                  <div>
                    <label className="text-micro text-[var(--text-muted)] block mb-1 font-mono">
                      Author (Optional)
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. Kazuo Ishiguro"
                      value={newFact.author}
                      onChange={(e) => setNewFact({ ...newFact, author: e.target.value })}
                      className="w-full text-xs bg-[var(--bg-base)] border border-[var(--border-hairline)] rounded-lg p-1.5 text-[var(--text-primary)] focus:outline-hidden"
                    />
                  </div>
                )}

                <div className="flex justify-end gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => setIsAddingFact(false)}
                    className="px-2.5 py-1 text-xs text-[var(--text-muted)] hover:text-[var(--text-primary)] rounded-lg"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={addFactLoading || !newFact.title.trim()}
                    className="px-3 py-1 bg-[var(--accent-primary)] text-stone-950 font-semibold text-xs rounded-lg hover:opacity-95 transition-opacity disabled:opacity-50 cursor-pointer flex items-center gap-1.5"
                  >
                    {addFactLoading && <RefreshCw className="w-3 h-3 animate-spin" />}
                    <span>Save to Vault</span>
                  </button>
                </div>
              </form>
            )}

            {/* Search Input */}
            <div className="p-3 border-b border-[var(--border-hairline)] bg-[var(--bg-surface)]/30">
              <div className="relative flex items-center">
                <Search className="w-3.5 h-3.5 absolute left-2.5 text-[var(--text-muted)]" />
                <input
                  type="text"
                  placeholder="Filter memories by keyword or title..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-8 pr-3 py-1.5 text-xs bg-[var(--bg-base)] border border-[var(--border-hairline)] rounded-lg text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-hidden focus:border-[var(--accent-primary)]/60 font-sans"
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => setSearchQuery("")}
                    className="absolute right-2 text-micro text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                  >
                    ✕
                  </button>
                )}
              </div>
            </div>

            {/* Domain Filter Tabs */}
            <div className="px-3 py-2 border-b border-[var(--border-hairline)] flex gap-1.5 overflow-x-auto no-scrollbar text-micro font-mono">
              {[
                { id: "all", label: `All (${knowledgeItems.length})` },
                { id: "profile", label: `Profile (${countProfile})` },
                { id: "cadence", label: `Cadence (${countCadence})` },
                { id: "reading_list", label: `Reading (${countReading})` },
                { id: "preference", label: `Preferences (${countPreference})` },
                { id: "note", label: `Notes (${countNotes})` },
              ].map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveCategoryFilter(tab.id)}
                  className={`px-2 py-1 rounded-md transition-colors cursor-pointer shrink-0 ${
                    activeCategoryFilter === tab.id
                      ? "bg-[var(--accent-primary)] text-stone-950 font-semibold"
                      : "text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-surface)]"
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Items List */}
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {knowledgeLoading ? (
                <div className="flex items-center justify-center p-8 text-xs text-[var(--text-muted)]">
                  <RefreshCw className="w-4 h-4 animate-spin text-[var(--accent-primary)] mr-2" />
                  Loading memory store...
                </div>
              ) : filteredKnowledge.length === 0 ? (
                <div className="text-center py-10 space-y-2">
                  <Info className="w-5 h-5 mx-auto text-[var(--text-muted)] opacity-60" />
                  <p className="text-xs text-[var(--text-muted)] font-sans">
                    No memories found matching your criteria.
                  </p>
                </div>
              ) : (
                filteredKnowledge.map((item) => {
                  const isEditing = editingItemId === item.id;
                  const cat = item.category?.toLowerCase() || "";

                  // Domain badges styling
                  let badgeColor = "bg-stone-500/15 text-stone-400 border-stone-500/30";
                  if (cat === "profile" || cat === "personal_fact") {
                    badgeColor = "bg-sky-500/15 text-sky-400 border-sky-500/30";
                  } else if (cat === "cadence" || cat === "habit" || cat === "routine") {
                    badgeColor = "bg-amber-500/15 text-amber-400 border-amber-500/30";
                  } else if (cat === "reading_list" || cat === "reading") {
                    badgeColor = "bg-emerald-500/15 text-emerald-400 border-emerald-500/30";
                  } else if (cat === "preference") {
                    badgeColor = "bg-indigo-500/15 text-indigo-400 border-indigo-500/30";
                  }

                  return (
                    <div
                      key={item.id}
                      className="p-3.5 rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-surface)] space-y-2 group relative hover:border-[var(--accent-primary)]/40 transition-colors shadow-xs"
                    >
                      {isEditing ? (
                        /* Inline Edit Form */
                        <div className="space-y-2.5">
                          <div className="flex items-center justify-between">
                            <span className="text-micro font-mono uppercase text-[var(--accent-primary)] font-semibold">
                              Editing Memory
                            </span>
                            <span className="text-micro font-mono text-[var(--text-muted)]">
                              ID: {item.id.slice(0, 8)}
                            </span>
                          </div>

                          <div className="grid grid-cols-2 gap-2">
                            <div>
                              <label className="text-micro text-[var(--text-muted)] block mb-1 font-mono">
                                Domain
                              </label>
                              <ThemedSelect
                                value={editForm.category}
                                onChange={(e) => setEditForm({ ...editForm, category: e.target.value })}
                                selectClassName="p-1.5 rounded-lg"
                              >
                                <option value="profile">profile</option>
                                <option value="cadence">cadence</option>
                                <option value="reading_list">reading_list</option>
                                <option value="preference">preference</option>
                                <option value="note">note</option>
                              </ThemedSelect>
                            </div>
                            <div>
                              <label className="text-micro text-[var(--text-muted)] block mb-1 font-mono">
                                Title
                              </label>
                              <input
                                type="text"
                                value={editForm.title}
                                onChange={(e) => setEditForm({ ...editForm, title: e.target.value })}
                                className="w-full text-xs bg-[var(--bg-base)] border border-[var(--border-hairline)] rounded-lg p-1.5 text-[var(--text-primary)]"
                              />
                            </div>
                          </div>

                          <div>
                            <label className="text-micro text-[var(--text-muted)] block mb-1 font-mono">
                              Content / Details
                            </label>
                            <textarea
                              rows={3}
                              value={editForm.content}
                              onChange={(e) => setEditForm({ ...editForm, content: e.target.value })}
                              className="w-full text-xs bg-[var(--bg-base)] border border-[var(--border-hairline)] rounded-lg p-1.5 text-[var(--text-primary)] resize-none"
                            />
                          </div>

                          <div className="flex justify-end gap-2 pt-1">
                            <button
                              type="button"
                              onClick={() => setEditingItemId(null)}
                              className="px-2.5 py-1 text-xs text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                            >
                              Cancel
                            </button>
                            <button
                              type="button"
                              disabled={editLoading || !editForm.title.trim()}
                              onClick={() => handleSaveEdit(item.id)}
                              className="px-3 py-1 bg-[var(--accent-primary)] text-stone-950 font-semibold text-xs rounded-lg hover:opacity-95 flex items-center gap-1.5 cursor-pointer"
                            >
                              {editLoading && <RefreshCw className="w-3 h-3 animate-spin" />}
                              <Save className="w-3 h-3" />
                              <span>Save Changes</span>
                            </button>
                          </div>
                        </div>
                      ) : (
                        /* Normal Memory Card View */
                        <>
                          <div className="flex items-center justify-between gap-2">
                            <span
                              className={`text-[9px] uppercase font-mono tracking-wider px-2 py-0.5 rounded border ${badgeColor}`}
                            >
                              {item.category}
                            </span>
                            <div className="flex items-center gap-1">
                              <button
                                type="button"
                                onClick={() => startEditing(item)}
                                className="text-[var(--text-muted)] hover:text-[var(--text-primary)] p-1 rounded opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
                                title="Edit memory"
                              >
                                <Edit3 className="w-3.5 h-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={async () => {
                                  await deleteUserKnowledge(item.id);
                                  loadKnowledge();
                                }}
                                className="text-[var(--text-muted)] hover:text-red-400 p-1 rounded opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
                                title="Delete memory"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>

                          <h5 className="font-semibold text-xs text-[var(--text-primary)] font-sans">
                            {item.title}
                          </h5>

                          {item.content && (
                            <p className="text-micro text-[var(--text-secondary)] font-sans leading-relaxed">
                              {item.content}
                            </p>
                          )}

                          {item.metadata?.author && (
                            <p className="text-micro text-[var(--text-muted)] font-mono">
                              Author: {item.metadata.author}
                            </p>
                          )}
                        </>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      )}

      {/* -------------------------------------------------------------------------- */}
      {/* ACADEMIC ASSIGNMENT DETAIL & SPEC POP-OUT MODAL                            */}
      {/* -------------------------------------------------------------------------- */}
      <AssignmentDetailModal
        isOpen={isAssignmentModalOpen}
        onClose={() => setIsAssignmentModalOpen(false)}
        assignment={selectedAssignment}
        onToggleSubmit={(id, nextState) => {
          setMessages((prev) =>
            prev.map((m) => {
              if (m.mentioned_assignments) {
                return {
                  ...m,
                  mentioned_assignments: m.mentioned_assignments.map((a) =>
                    a.id === id ? { ...a, is_submitted: nextState } : a
                  ),
                };
              }
              return m;
            })
          );
        }}
        onScheduleFocus={(assign) => {
          setIsAssignmentModalOpen(false);
          const cleanTitle = assign.title.replace(/\s*\[.*?\]\s*/g, "").trim();
          handleSendMessage(`Schedule a 2-hour focus block for ${cleanTitle} today`);
        }}
      />

      {/* -------------------------------------------------------------------------- */}
      {/* CALENDAR EVENT DETAIL POP-OUT MODAL                                        */}
      {/* -------------------------------------------------------------------------- */}
      <EventDetailModal
        isOpen={isEventModalOpen}
        onClose={() => setIsEventModalOpen(false)}
        event={selectedEvent}
        onUpdate={() => {}}
        onDelete={() => {}}
      />
    </div>
  );
}
