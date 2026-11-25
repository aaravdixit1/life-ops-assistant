"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import {
  Sun,
  Moon,
  Clock,
  Sparkles,
  ArrowRight,
  ExternalLink,
  Check,
  Copy,
  BookOpen,
  Calendar,
  Send,
  Trash2,
  Bookmark,
  Coffee,
  MapPin,
  RefreshCw,
  Plus,
  ChevronDown,
  ChevronUp,
  Quote,
  Compass,
  Newspaper,
  Lightbulb,
  Bot,
} from "lucide-react";
import {
  getDailyBrief,
  getRandomCuriosity,
  adoptDailyPlan,
  sendDirectLineMessage,
  getUserKnowledge,
  deleteUserKnowledge,
  commitAssistantEvent,
} from "@/lib/api";
import { AssignmentDetailModal, AcademicAssignment } from "@/components/academics/assignment-modal";
import { EventDetailModal } from "@/components/calendar/event-modals";
import { FormattedMarkdown } from "@/components/ui/formatted-content";
import { getHiddenCalendarIds, isCalendarVisible } from "@/lib/calendar-visibility";
import { formatDateTime, cleanAssignmentTitle } from "@/lib/formatters";
import { PERSONA } from "@/lib/persona";
import { useProfile } from "@/components/profile-provider";

export default function DailyBriefPage() {
  const { profile, isDemo, termLabel, locationLabel, studySanctuary, academicProfile } = useProfile();
  const [brief, setBrief] = useState<any | null>(null);
  const [curiosity, setCuriosity] = useState<any | null>(null);
  const [isShufflingFact, setIsShufflingFact] = useState(false);
  const [knowledge, setKnowledge] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [nowDate, setNowDate] = useState<Date | null>(null);
  const [copied, setCopied] = useState(false);
  const [adopting, setAdopting] = useState(false);
  const [adoptMsg, setAdoptMsg] = useState<string | null>(null);

  // Direct Line state
  const [directInput, setDirectInput] = useState("");
  const [directLoading, setDirectLoading] = useState(false);
  const [directResponse, setDirectResponse] = useState<string | null>(null);
  const [directRecommendations, setDirectRecommendations] = useState<any[]>([]);
  const [directProposedEvent, setDirectProposedEvent] = useState<any | null>(null);
  const [directSavedFacts, setDirectSavedFacts] = useState<any[]>([]);
  const [eventCommitting, setEventCommitting] = useState(false);
  const [eventCommitted, setEventCommitted] = useState(false);

  // Curated Book details & selection state
  const [showBookDetails, setShowBookDetails] = useState(false);
  const [selectedBookIndex, setSelectedBookIndex] = useState(0);

  // Academic Assignment & Event Pop-out Modals
  const [selectedAssignment, setSelectedAssignment] = useState<AcademicAssignment | null>(null);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
  const [selectedEvent, setSelectedEvent] = useState<any | null>(null);
  const [isEventModalOpen, setIsEventModalOpen] = useState(false);
  const [hiddenCalendarIds, setHiddenCalIds] = useState<string[]>([]);

  const loadData = async () => {
    try {
      setLoading(true);
      const [briefData, knowledgeData] = await Promise.all([
        getDailyBrief(),
        getUserKnowledge(),
      ]);
      setBrief(briefData);
      if (briefData?.curiosity) {
        setCuriosity(briefData.curiosity);
      }
      setKnowledge(knowledgeData || []);
    } catch (e) {
      console.error("Failed to load daily brief data", e);
    } finally {
      setLoading(false);
    }
  };

  const handleShuffleCuriosity = async () => {
    try {
      setIsShufflingFact(true);
      const newFact = await getRandomCuriosity();
      if (newFact) {
        setCuriosity(newFact);
      }
    } catch (err) {
      console.error("Failed to shuffle curiosity:", err);
    } finally {
      setIsShufflingFact(false);
    }
  };

  useEffect(() => {
    setNowDate(new Date());
    setHiddenCalIds(getHiddenCalendarIds());
    loadData();

    const handleRefresh = () => loadData();
    const handleFilterSync = () => setHiddenCalIds(getHiddenCalendarIds());
    window.addEventListener("lifeops-refresh-calendar", handleRefresh);
    window.addEventListener("lifeops-refresh-assignments", handleRefresh);
    window.addEventListener("lifeops-profile-updated", handleRefresh);
    window.addEventListener("lifeops-calendar-filter-changed", handleFilterSync);

    const timer = setInterval(() => {
      setNowDate(new Date());
    }, 30000);
    return () => {
      window.removeEventListener("lifeops-refresh-calendar", handleRefresh);
      window.removeEventListener("lifeops-refresh-assignments", handleRefresh);
      window.removeEventListener("lifeops-profile-updated", handleRefresh);
      window.removeEventListener("lifeops-calendar-filter-changed", handleFilterSync);
      clearInterval(timer);
    };
  }, []);

  const handleCopyBrief = () => {
    if (!brief) return;
    const ed = brief.editorial || {};
    const text = `# Daily Brief · ${brief.greeting?.subtitle || "Friday, November 13, 2026"}

"${ed.headline || "Are you giving today's hours to what actually moves the needle?"}"

${ed.reflection || brief.greeting?.lead || ""}

## Focus Today
${ed.do?.map((item: string) => `* ${item}`).join("\n") || "* Focus Block: PA5 Virtual Memory Simulator"}

## Avoid
${ed.dont?.map((item: string) => `* ${item}`).join("\n") || "* Procrastinating until evening"}

## Recommended Reading
${ed.reading?.title ? `* ${ed.reading.title} by ${ed.reading.author} — ${ed.reading.note}` : "* The Myth of Sisyphus by Albert Camus"}
`;

    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  const handleAdoptPlan = async (planId = "plan-a") => {
    setAdopting(true);
    setAdoptMsg(null);
    try {
      const res = await adoptDailyPlan(planId);
      setAdoptMsg(res.message);
      window.dispatchEvent(new Event("lifeops-refresh-calendar"));
      const updated = await getDailyBrief();
      setBrief(updated);
    } catch (err: any) {
      setAdoptMsg(`Failed to adopt plan: ${err.message}`);
    } finally {
      setAdopting(false);
      setTimeout(() => setAdoptMsg(null), 5000);
    }
  };

  const handleDirectSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!directInput.trim() || directLoading) return;

    const message = directInput.trim();
    setDirectLoading(true);
    setDirectResponse(null);
    setDirectProposedEvent(null);
    setDirectSavedFacts([]);
    setEventCommitted(false);
    try {
      const res = await sendDirectLineMessage(message);
      setDirectResponse(res.message);
      if (res.recommendations && res.recommendations.length > 0) {
        setDirectRecommendations(res.recommendations);
      } else {
        setDirectRecommendations([]);
      }
      if (res.proposed_event) {
        setDirectProposedEvent(res.proposed_event);
      }
      if (res.saved_facts) {
        setDirectSavedFacts(res.saved_facts);
      }
      setDirectInput("");

      // Refresh knowledge base, brief, and calendar simultaneously
      const [updatedKnowledge, updatedBrief] = await Promise.all([
        getUserKnowledge(),
        getDailyBrief(),
      ]);
      setKnowledge(updatedKnowledge || []);
      setBrief(updatedBrief);
      if (res.action === "calendar_event") {
        window.dispatchEvent(new Event("lifeops-refresh-calendar"));
      }
    } catch (err: any) {
      setDirectResponse(`Error: ${err.message}`);
    } finally {
      setDirectLoading(false);
    }
  };

  const handleCommitDirectEvent = async () => {
    if (!directProposedEvent || eventCommitting) return;
    setEventCommitting(true);
    try {
      await commitAssistantEvent({
        summary: directProposedEvent.summary,
        start_time: directProposedEvent.start_time,
        end_time: directProposedEvent.end_time,
        location: directProposedEvent.location,
        description: directProposedEvent.description,
        color: directProposedEvent.color || "#d97706",
        source: directProposedEvent.source || "life_ops_study_block",
      });
      setEventCommitted(true);
      window.dispatchEvent(new Event("lifeops-refresh-calendar"));
      const updatedBrief = await getDailyBrief();
      setBrief(updatedBrief);
    } catch (err: any) {
      console.error("Failed to commit event:", err);
    } finally {
      setEventCommitting(false);
    }
  };

  const handleAddRecommendedBook = async (book: {
    title: string;
    author?: string;
    category?: string;
    reason?: string;
  }) => {
    try {
      setDirectLoading(true);
      const addMsg = `Add "${book.title}" by ${book.author || "Unknown"} to my reading list`;
      const res = await sendDirectLineMessage(addMsg, "reading_list");
      setDirectResponse(res.message);

      const [updatedKnowledge, updatedBrief] = await Promise.all([
        getUserKnowledge(),
        getDailyBrief(),
      ]);
      setKnowledge(updatedKnowledge || []);
      setBrief(updatedBrief);
      // Remove from recommendations once added
      setDirectRecommendations((prev) => prev.filter((b) => b.title !== book.title));
    } catch (err: any) {
      setDirectResponse(`Error adding book: ${err.message}`);
    } finally {
      setDirectLoading(false);
    }
  };

  const handleDeleteKnowledge = async (id: string) => {
    try {
      await deleteUserKnowledge(id);
      setKnowledge((prev) => prev.filter((item) => item.id !== id));
    } catch (err) {
      console.error("Failed to delete knowledge item", err);
    }
  };

  if (loading && !brief) {
    return (
      <div className="min-h-[70vh] flex flex-col items-center justify-center space-y-4">
        <div className="w-5 h-5 border-2 border-[var(--accent-primary)] border-t-transparent rounded-full animate-spin" />
        <p className="font-serif italic text-base text-[var(--text-muted)] tracking-wide">
          Distilling your day...
        </p>
      </div>
    );
  }

  const editorial = brief?.editorial || {};
  const weather = brief?.weather || {};
  const isDaytime = weather?.is_daytime !== undefined
    ? Boolean(weather.is_daytime)
    : nowDate
      ? (nowDate.getHours() >= 6 && nowDate.getHours() < 18)
      : (new Date().getHours() >= 6 && new Date().getHours() < 18);
  const reading = editorial.reading || {};
  const doList: string[] = editorial.do || [];
  const dontList: string[] = editorial.dont || [];
  const rawTimeline: any[] = brief?.narrative_schedule || [];
  const timeline: any[] = rawTimeline.filter((item) => isCalendarVisible(item, hiddenCalendarIds));
  const assignments: any[] = brief?.assignments_due_soon || [];
  const pa5Hw = assignments.find((a: any) => a.title.toLowerCase().includes("pa5")) || assignments[0];
  const graceHw = assignments.find((a: any) => a.is_grace_window || a.title.toLowerCase().includes("proposal"));
  const remainingHw = assignments.filter((a: any) => a.id !== pa5Hw?.id && a.id !== graceHw?.id);

  const curatedBooks = [
    {
      title: brief?.editorial?.reading?.title || "The Myth of Sisyphus",
      author: brief?.editorial?.reading?.author || "Albert Camus",
      category: "Philosophy · Absurdism",
      topics: ["Absurdism", "Radical Acceptance", "Resilience in Repetition", "Conscious Revolt"],
      summary:
        brief?.editorial?.reading?.note ||
        "Camus addresses existence's core question: how to live with fierce passion in an indifferent universe. Sisyphus, condemned to roll his boulder up the mountain for eternity, transforms the rock into an act of supreme dignity and lucid mastery.",
      quote: "The struggle itself toward the heights is enough to fill a man's heart. One must imagine Sisyphus happy.",
      relevance:
        "Directly reframes demanding engineering sprints and repetitive systems debugging as conscious crafts to embrace rather than dread.",
    },
    {
      title: "The Stranger",
      author: "Albert Camus",
      category: "Philosophical Fiction",
      topics: ["Authenticity", "Social Conventions", "Existential Honesty", "Lucidity"],
      summary:
        "Through Meursault, Camus explores a man who refuses to perform societal pretense or feign emotions he does not feel, stripping life down to its rawest, most unvarnished truth.",
      quote: "I opened myself to the gentle indifference of the world.",
      relevance:
        "A reminder to maintain internal authenticity and refuse superficial posturing when navigating academic and social pressures.",
    },
    {
      title: "Meditations",
      author: "Marcus Aurelius",
      category: "Philosophy · Stoicism",
      topics: ["Dichotomy of Control", "Mental Equilibrium", "Duty", "Present Moment"],
      summary:
        "Private journal entries of the Roman emperor reflecting on duty, mortality, and emotional discipline. Emphasizes focusing solely on what is within your direct power while accepting external outcomes with tranquility.",
      quote: "You have power over your mind — not outside events. Realize this, and you will find strength.",
      relevance:
        "Invaluable for keeping composure when schedules shift, code fails, or external demands pile up during midterms.",
    },
    {
      title: "Crime and Punishment",
      author: "Fyodor Dostoevsky",
      category: "Literary Fiction · Psychology",
      topics: ["Moral Conscience", "Intellectual Pride", "Redemption", "Alienation"],
      summary:
        "Follows Raskolnikov's psychological torment after attempting to prove himself an 'extraordinary man' above moral law, examining how profound isolation gives way to suffering and spiritual resurrection.",
      quote: "It takes something more than intelligence to act intelligently.",
      relevance:
        "An antidote to intellectual hubris, highlighting that technical brilliance is meaningless without emotional maturity and empathy.",
    },
  ];

  const userReadingBooks = knowledge
    .filter((k) => k.category === "reading_list")
    .map((k) => {
      let author = "";
      if (k.metadata) {
        if (typeof k.metadata === "string") {
          try {
            const parsed = JSON.parse(k.metadata);
            if (parsed.author) author = parsed.author;
          } catch (e) {}
        } else if (k.metadata.author) {
          author = k.metadata.author;
        }
      }
      if (!author || author.toLowerCase().includes("selected")) {
        if (k.title.toLowerCase().includes("klara")) author = "Kazuo Ishiguro";
        else if (k.title.toLowerCase().includes("stranger")) author = "Albert Camus";
        else if (k.title.toLowerCase().includes("sisyphus")) author = "Albert Camus";
        else if (k.title.toLowerCase().includes("meditations")) author = "Marcus Aurelius";
        else if (k.title.toLowerCase().includes("crime")) author = "Fyodor Dostoevsky";
        else author = "Literature Pick";
      }

      const isKlara = k.title.toLowerCase().includes("klara");

      return {
        title: k.title,
        author: author,
        category: "Personal Reading Shelf",
        isUserChoice: true,
        topics: isKlara
          ? ["Consciousness", "Human Empathy", "Artificial Intelligence", "Observational Care"]
          : ["Philosophy", "Literature", "Personal Reflection"],
        summary:
          k.content ||
          "A profound literary exploration chosen directly for your reading horizons.",
        quote: isKlara
          ? "Do you believe in the human heart? I don't mean simply the organ, obviously. But do you believe there's something that makes each of us special and individual?"
          : "The struggle itself toward the heights is enough to fill a man's heart. One must imagine Sisyphus happy.",
        relevance: isKlara
          ? "As an engineer building intelligent computing systems, Klara serves as a profound contemplation on consciousness, machine perception, and preserving genuine human warmth amidst technological abstraction."
          : "Offers a vital mental reset away from code and assignments, exploring philosophical resilience and purpose.",
      };
    });

  // Featured book spotlight: if user has a reading list pick, feature it; otherwise Camus
  const featuredBook =
    userReadingBooks.length > 0
      ? userReadingBooks[0]
      : {
          title: brief?.editorial?.reading?.title || "The Myth of Sisyphus",
          author: brief?.editorial?.reading?.author || "Albert Camus",
          category: "Philosophy · Absurdism",
          isUserChoice: Boolean(brief?.editorial?.reading?.is_user_choice),
          topics: ["Absurdism", "Radical Acceptance", "Resilience in Repetition", "Conscious Revolt"],
          summary:
            brief?.editorial?.reading?.note ||
            "Camus addresses existence's core question: how to live with fierce passion in an indifferent universe. Sisyphus, condemned to roll his boulder up the mountain for eternity, transforms the rock into an act of supreme dignity and lucid mastery.",
          quote: "The struggle itself toward the heights is enough to fill a man's heart. One must imagine Sisyphus happy.",
          relevance:
            "Directly reframes demanding engineering sprints and repetitive systems debugging as conscious crafts to embrace rather than dread.",
        };

  return (
    <div className="min-h-screen py-10 px-4 md:px-8 max-w-3xl mx-auto space-y-14 font-sans selection:bg-[var(--accent-primary)]/20 selection:text-[var(--text-primary)]">
      {/* -------------------------------------------------------------------------- */}
      {/* 1. TOP HORIZON: BOLD ORIENTATION (DATE, LIVE TIME, WEATHER)                */}
      {/* -------------------------------------------------------------------------- */}
      <header className="pb-6 border-b border-[var(--border-hairline)] space-y-4">
        {/* Top brand line & actions */}
        <div className="flex items-center justify-between text-xs text-[var(--text-muted)]">
          <div className="flex items-center gap-2.5">
            <span className="font-serif italic text-base text-[var(--text-primary)] font-bold tracking-tight">
              Life-Ops Daily Brief
            </span>
            <span className="text-micro uppercase font-mono tracking-widest text-[var(--text-muted)]">
              {termLabel}
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleCopyBrief}
              className="flex items-center gap-1.5 px-3 py-1 rounded text-xs font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-surface)] transition-colors duration-75 active:scale-[0.98] cursor-pointer border border-[var(--border-hairline)] shadow-xs"
              title="Copy brief markdown to clipboard"
            >
              {copied ? (
                <>
                  <Check className="w-3.5 h-3.5 text-[var(--semantic-success)]" />
                  <span className="text-[var(--semantic-success)] font-semibold">Copied</span>
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5" />
                  <span>Export</span>
                </>
              )}
            </button>
            <button
              onClick={loadData}
              className="p-1.5 rounded text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-surface)] transition-colors duration-75 active:scale-[0.98] cursor-pointer border border-transparent hover:border-[var(--border-hairline)]"
              title="Refresh brief"
            >
              <RefreshCw className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* BOLD ORIENTATION STRIP: Date, Dynamic Time, Weather */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5 p-4 rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-surface)]/60">
          {/* Bold Date */}
          <div className="flex items-center gap-3 min-w-0">
            <div className="p-2 rounded-lg bg-[var(--accent-primary)]/15 text-[var(--accent-primary)] border border-[var(--accent-primary)]/30 shrink-0">
              <Calendar className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <span className="text-micro uppercase font-mono tracking-wider text-[var(--text-muted)] block font-semibold truncate">
                Calendar Horizon
              </span>
              <span className="text-sm font-bold text-[var(--text-primary)] tracking-tight block truncate">
                {nowDate
                  ? nowDate.toLocaleDateString("en-US", {
                      weekday: "short",
                      month: "short",
                      day: "numeric",
                      year: "numeric",
                    })
                  : "Fri, Nov 13, 2026"}
              </span>
            </div>
          </div>

          {/* Bold Live Time */}
          <div className="flex items-center gap-3 min-w-0 border-t sm:border-t-0 sm:border-l border-[var(--border-hairline)]/70 pt-2.5 sm:pt-0 sm:pl-4">
            <div className="p-2 rounded-lg bg-[var(--accent-primary)]/15 text-[var(--accent-primary)] border border-[var(--accent-primary)]/30 shrink-0">
              <Clock className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <span className="text-micro uppercase font-mono tracking-wider text-[var(--text-muted)] block font-semibold truncate">
                Live Time
              </span>
              <span className="text-sm sm:text-base font-bold font-mono text-[var(--accent-primary)] tabular-nums tracking-tight block truncate">
                {nowDate
                  ? nowDate.toLocaleTimeString("en-US", {
                      hour: "2-digit",
                      minute: "2-digit",
                      second: "2-digit",
                    })
                  : "02:35:00 AM"}
              </span>
            </div>
          </div>

          {/* Bold Weather */}
          <div className="flex items-center gap-3 min-w-0 border-t sm:border-t sm:border-l-0 lg:border-t-0 lg:border-l border-[var(--border-hairline)]/70 pt-2.5 sm:pt-2.5 lg:pt-0 sm:pl-0 lg:pl-4 sm:col-span-2 lg:col-span-1">
            <div className={`p-2 rounded-lg shrink-0 ${
              isDaytime
                ? "bg-amber-500/15 text-amber-500 dark:text-amber-400 border border-amber-500/30"
                : "bg-sky-500/15 text-sky-500 dark:text-sky-400 border border-sky-500/30"
            }`}>
              {isDaytime ? (
                <Sun className="w-4 h-4" />
              ) : (
                <Moon className="w-4 h-4" />
              )}
            </div>
            <div className="min-w-0 flex-1">
              <span className="text-micro uppercase font-mono tracking-wider text-[var(--text-muted)] block font-semibold truncate">
                Weather · {locationLabel}
              </span>
              <div className="flex items-center gap-2 min-w-0">
                <span className="text-sm sm:text-base font-bold text-[var(--text-primary)] tabular-nums shrink-0">
                  {weather.temp_f ?? (isDaytime ? 48 : 44)}°F
                </span>
                <span className="text-xs font-semibold text-[var(--text-secondary)] truncate">
                  {weather.short_condition ? weather.short_condition.replace(/^[·\s]+/, "") : (isDaytime ? "Crisp Fall Day" : "Crisp Fall Night")}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* BOLD CIRCADIAN SLEEP DEBT ALERT (Triggered late night between 12 AM - 6 AM) */}
        {brief?.sleep_opportunity && (
          <div className="p-4 rounded-xl border border-[var(--semantic-warning)]/60 bg-[var(--bg-surface)] shadow-xs space-y-2.5 animate-in fade-in">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--semantic-warning)]/20 pb-2">
              <div className="flex items-center gap-2 flex-wrap">
                <Moon className="w-4 h-4 text-[var(--semantic-warning)] shrink-0" />
                <span className="font-bold text-xs uppercase tracking-wider text-[var(--text-primary)] font-mono">
                  Circadian Sleep Alert · Target: {brief.sleep_opportunity.target_wakeup} Wake-Up
                </span>
                <span className="px-2 py-0.5 rounded text-[11px] font-bold uppercase tracking-wider bg-[var(--semantic-warning)]/15 text-[var(--text-primary)] border border-[var(--semantic-warning)]/40 font-mono">
                  {brief.sleep_opportunity.time_str} Sleep Left
                </span>
              </div>
              <span className="text-micro font-mono uppercase tracking-widest text-[var(--semantic-warning)] font-bold px-2.5 py-1 rounded bg-[var(--bg-base)] border border-[var(--semantic-warning)]/50 shrink-0">
                Recommended: Lights Out
              </span>
            </div>
            <p className="text-xs sm:text-sm text-[var(--text-secondary)] font-medium leading-relaxed font-sans">
              {brief.sleep_opportunity.warning}
            </p>
          </div>
        )}
      </header>

      {/* -------------------------------------------------------------------------- */}
      {/* 2. THE PROVOCATIVE REFLECTION (CO-STAR EDITORIAL HEADLINE)                 */}
      {/* -------------------------------------------------------------------------- */}
      <section className="text-center space-y-6 pt-2 max-w-2xl mx-auto">
        {/* Big Editorial Headline */}
        <h1
          className="text-2xl sm:text-3xl md:text-4xl text-[var(--text-primary)] leading-tight tracking-tight font-serif italic"
          style={{ fontFamily: "var(--font-serif)" }}
        >
          {editorial.headline || "Are you giving today's hours to what actually moves the needle?"}
        </h1>

        {/* Personalized Narrative Prose */}
        <p className="text-sm sm:text-base text-[var(--text-secondary)] leading-relaxed font-sans max-w-xl mx-auto">
          {editorial.reflection || brief?.greeting?.lead}
        </p>

        {/* Editorial Pull-Quote (Item 3) */}
        <div className="pt-2 pb-1 max-w-lg mx-auto">
          <p className="font-serif italic text-sm sm:text-base text-[var(--accent-primary)] leading-relaxed">
            "In the midst of winter, I found there was, within me, an invincible summer."
          </p>
          <span className="text-micro font-mono text-[var(--text-muted)] tracking-widest uppercase mt-1 block">
            — Albert Camus, Return to Tipasa
          </span>
        </div>
      </section>

      {/* -------------------------------------------------------------------------- */}
      {/* 3. CO-STAR STYLE: "FOCUS" & "AVOID" (DO / DON'T BALANCED COLUMNS)          */}
      {/* -------------------------------------------------------------------------- */}
      <section className="py-8 border-y border-[var(--border-hairline)] max-w-xl mx-auto">
        <div className="grid grid-cols-2 divide-x divide-[var(--border-hairline)]/60 text-center">
          {/* FOCUS COLUMN */}
          <div className="space-y-4 px-4 sm:px-6 flex flex-col items-center justify-start">
            <span
              className="block text-xs uppercase tracking-[0.25em] font-medium text-[var(--accent-primary)] text-center font-sans"
            >
              Focus
            </span>
            <ul className="space-y-3 w-full flex flex-col items-center">
              {doList.map((item, idx) => (
                <li
                  key={idx}
                  className="text-xs sm:text-sm text-[var(--text-primary)] leading-relaxed font-serif italic text-center max-w-[220px]"
                  style={{ fontFamily: "var(--font-serif)" }}
                >
                  {item}
                </li>
              ))}
            </ul>
          </div>

          {/* AVOID COLUMN */}
          <div className="space-y-4 px-4 sm:px-6 flex flex-col items-center justify-start">
            <span
              className="block text-xs uppercase tracking-[0.25em] font-medium text-[var(--text-muted)] text-center font-sans"
            >
              Avoid
            </span>
            <ul className="space-y-3 w-full flex flex-col items-center">
              {dontList.map((item, idx) => (
                <li
                  key={idx}
                  className="text-xs sm:text-sm text-[var(--text-secondary)] leading-relaxed font-serif italic text-center opacity-85 max-w-[220px]"
                  style={{ fontFamily: "var(--font-serif)" }}
                >
                  {item}
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* Minimalist Astral Glyph Centerpiece */}
        <div className="pt-8 flex items-center justify-center gap-4 text-[var(--text-muted)] text-micro tracking-[0.3em] font-mono">
          <span>◇</span>
          <span>◈</span>
          <span>◇</span>
        </div>
      </section>

      {/* -------------------------------------------------------------------------- */}
      {/* 4. ASYMMETRIC ACADEMIC HORIZON (EDITORIAL SHOWCASE)                         */}
      {/* -------------------------------------------------------------------------- */}
      {assignments.length > 0 && (
        <section className="space-y-5 max-w-2xl mx-auto">
          <div className="flex items-center justify-between text-xs text-[var(--text-muted)] pb-2 border-b border-[var(--border-hairline)]">
            <div className="flex items-center gap-2">
              <span className="uppercase tracking-[0.2em] text-micro font-medium">
                Academic Horizons
              </span>
              <span className="text-micro font-mono text-[var(--accent-primary)] font-semibold">
                · {assignments.length} milestones active
              </span>
            </div>
            <Link
              href="/academics"
              className="text-micro text-[var(--accent-primary)] hover:underline flex items-center gap-1 font-sans"
            >
              <span>View Academics</span>
              <ArrowRight className="w-3 h-3" />
            </Link>
          </div>

          {/* Asymmetric 2-Column Editorial Grid */}
          <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-stretch">
            {/* Left Feature: Primary Critical Focus (7 cols) */}
            {pa5Hw && (
              <div className="md:col-span-7 p-5 rounded-2xl border border-[var(--accent-primary)]/40 bg-[var(--bg-surface)] flex flex-col justify-between space-y-4 relative overflow-hidden group hover:border-[var(--accent-primary)]/80 transition-all shadow-xs">
                <div className="space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-micro font-mono uppercase tracking-wider font-bold px-2 py-0.5 rounded bg-[var(--accent-primary)]/15 text-[var(--accent-primary)] border border-[var(--accent-primary)]/30">
                      Primary Critical Milestone
                    </span>
                    <span className="text-sm font-mono text-[var(--text-muted)]/60 font-bold">
                      01
                    </span>
                  </div>

                  <div className="min-w-0">
                    <span className="text-micro font-mono uppercase text-[var(--text-muted)] tracking-wider block font-semibold">
                      {pa5Hw.course_name ? pa5Hw.course_name.replace(/[[\]]/g, "").replace(/_/g, " ") : "Coursework"}
                    </span>
                    <h3
                      className="text-xl sm:text-2xl font-serif italic text-[var(--text-primary)] leading-tight tracking-tight mt-1 break-words"
                      style={{ fontFamily: "var(--font-serif)" }}
                    >
                      {cleanAssignmentTitle(pa5Hw.title) || pa5Hw.title}
                    </h3>
                  </div>

                  <p className="text-xs text-[var(--text-secondary)] font-sans leading-relaxed line-clamp-3">
                    {pa5Hw.ai_summary ||
                      (pa5Hw.description
                        ? pa5Hw.description.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 180)
                        : "Open this assignment task to inspect deliverables, rubric, and focus blocks.")}
                  </p>
                </div>

                <div className="pt-3 border-t border-[var(--border-hairline)] flex items-center justify-between text-xs">
                  <span className="font-mono text-micro text-[var(--accent-primary)] font-semibold">
                    {pa5Hw.due_at ? `Due ${formatDateTime(pa5Hw.due_at)}` : "Active Deliverable"}
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedAssignment(pa5Hw);
                      setIsDetailModalOpen(true);
                    }}
                    className="text-micro text-[var(--text-muted)] group-hover:text-[var(--text-primary)] transition-colors flex items-center gap-1 font-sans cursor-pointer"
                  >
                    <span>Inspect Spec</span>
                    <ArrowRight className="w-3 h-3" />
                  </button>
                </div>
              </div>
            )}

            {/* Right Column: Grace Window & Horizon Stream (5 cols) */}
            <div className="md:col-span-5 flex flex-col justify-between gap-4">
              {/* Active Grace Window Feature */}
              {graceHw && (
                <div
                  onClick={() => {
                    setSelectedAssignment(graceHw);
                    setIsDetailModalOpen(true);
                  }}
                  className="p-4 rounded-xl border border-amber-500/50 bg-[var(--bg-surface)]/60 space-y-2.5 cursor-pointer hover:border-amber-400 transition-colors"
                  title="Click to view full deliverable spec"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-micro font-mono uppercase font-bold px-2 py-0.5 rounded bg-amber-500/15 text-amber-300 border border-amber-500/30">
                      ✦ Grace Window Active
                    </span>
                    <span className="text-sm font-mono text-[var(--text-muted)]/60 font-bold">
                      02
                    </span>
                  </div>

                  <div className="min-w-0">
                    <span className="text-micro font-mono uppercase text-[var(--text-muted)] tracking-wider block font-semibold">
                      {graceHw.course_name ? graceHw.course_name.replace(/[[\]]/g, "").replace(/_/g, " ") : "Coursework"}
                    </span>
                    <h4
                      className="text-base font-serif italic text-[var(--text-primary)] leading-snug break-words"
                      style={{ fontFamily: "var(--font-serif)" }}
                    >
                      {cleanAssignmentTitle(graceHw.title) || graceHw.title}
                    </h4>
                  </div>

                  <p className="text-xs text-[var(--text-secondary)] leading-relaxed font-sans line-clamp-3">
                    {graceHw.ai_summary ||
                      (graceHw.description
                        ? graceHw.description.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 160)
                        : "Grace window active — give it a final review and submit cleanly.")}
                  </p>

                  <div className="pt-2 text-micro font-mono text-amber-300/90 font-medium">
                    {graceHw.due_at ? `Due ${formatDateTime(graceHw.due_at)}` : "Recent Deliverable"}
                  </div>
                </div>
              )}

              {/* Upcoming deliverables stream */}
              {remainingHw.length > 0 && (
                <div className="p-3.5 rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-surface)]/30 space-y-2">
                  <span className="text-micro font-mono uppercase text-[var(--text-muted)] tracking-wider block font-medium">
                    Next Up on Horizon
                  </span>
                  <div className="space-y-1.5">
                    {remainingHw.slice(0, 2).map((hw: any, idx: number) => (
                      <div
                        key={hw.id || idx}
                        onClick={() => {
                          setSelectedAssignment(hw);
                          setIsDetailModalOpen(true);
                        }}
                        className="flex items-center justify-between text-xs py-1 border-b last:border-0 border-[var(--border-hairline)]/40 cursor-pointer hover:bg-[var(--bg-hover)]/30 px-1 rounded transition-colors"
                        title="Click to view deliverable spec"
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="text-micro font-mono text-[var(--text-muted)]">
                            0{idx + 3}
                          </span>
                          <span className="text-xs text-[var(--text-primary)] truncate font-sans">
                            {cleanAssignmentTitle(hw.title) || hw.title}
                          </span>
                        </div>
                        <span className="text-micro font-mono text-[var(--text-muted)] shrink-0 pl-2">
                          {hw.due_at
                            ? new Date(hw.due_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })
                            : "Upcoming"}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </section>
      )}

      {/* -------------------------------------------------------------------------- */}
      {/* 5. TODAY'S STREAM TIMELINE (NO BOXES, HAIRLINE SPINE)                      */}
      {/* -------------------------------------------------------------------------- */}
      <section className="space-y-6 max-w-2xl mx-auto">
        <div className="flex items-center justify-between pb-2 border-b border-[var(--border-hairline)] text-xs text-[var(--text-muted)]">
          <span className="uppercase tracking-[0.18em] text-micro font-medium">
            Timeline Rhythm
          </span>
          <span className="text-micro font-mono tabular-nums text-[var(--text-muted)]">
            {locationLabel}
          </span>
        </div>

        {timeline.length === 0 ? (
          <div className="p-6 rounded-xl border border-dashed border-[var(--border-hairline)] text-center space-y-2.5 text-xs font-sans">
            <p className="text-[var(--text-secondary)] font-medium">
              No events scheduled on your calendar for today.
            </p>
            <p className="text-[var(--text-muted)]">
              Connect Google, Apple, or Canvas calendars in Setup, or add a focus block on your Weekly Schedule.
            </p>
            <div className="flex items-center justify-center gap-2 pt-1">
              <Link
                href="/setup"
                className="px-3 py-1.5 rounded-md border border-[var(--border-hairline)] bg-[var(--bg-surface)] text-[var(--text-primary)] hover:border-[var(--accent-primary)] transition-colors"
              >
                Open Setup
              </Link>
              <Link
                href="/schedule"
                className="px-3 py-1.5 rounded-md bg-[var(--accent-primary)] text-[var(--bg-base)] font-semibold hover:opacity-90 transition-opacity"
              >
                Open Schedule
              </Link>
            </div>
          </div>
        ) : (
        <div className="relative pl-8 space-y-6">
          {/* Mathematically Centered Coaxial Vertical Spine (16px axis) */}
          <div className="absolute left-4 top-2.5 bottom-4 w-0.5 -translate-x-1/2 bg-[var(--border-hairline)] pointer-events-none" />

          {timeline.map((item: any, idx: number) => {
            const isNext = item.status === "next_up";
            const isDone = item.status === "completed";
            const isCanvas = item.source === "canvas_inferred" || item.item_type === "task" && Boolean(item.assignment_id);

            return (
              <div
                key={item.id || idx}
                onClick={() => {
                  if (isCanvas && item.assignment_id) {
                    const matched = assignments.find((a) => a.id === item.assignment_id);
                    setSelectedAssignment(
                      matched || {
                        id: item.assignment_id,
                        course_name: item.location,
                        title: item.title,
                        description: item.description || "",
                        due_at: item.end_time,
                        is_submitted: Boolean(item.is_submitted),
                      }
                    );
                    setIsDetailModalOpen(true);
                  } else if (item.id && item.start_time) {
                    setSelectedEvent(item);
                    setIsEventModalOpen(true);
                  }
                }}
                className="relative group cursor-pointer rounded-md px-2 py-1 -mx-2 hover:bg-[var(--bg-hover)]/35 transition-colors"
                title="Click to open details"
              >
                {/* Node wrapper: 32px (w-8) pinned at left-0 to align dot center exactly on 16px spine */}
                <div className="absolute -left-6 top-2 w-8 flex items-center justify-center pointer-events-none">
                  <div
                    className={`w-3.5 h-3.5 rounded-full border-2 transition-all ${
                      isNext
                        ? "bg-[var(--accent-primary)] border-[var(--accent-primary)] ring-4 ring-[var(--accent-primary)]/25"
                        : isDone
                        ? "bg-[var(--bg-surface)] border-[var(--text-muted)]/60"
                        : "bg-[var(--bg-base)] border-[var(--border-hairline)] group-hover:border-[var(--accent-primary)]"
                    }`}
                  />
                </div>

                <div className="flex flex-col sm:flex-row sm:items-baseline justify-between gap-1">
                  <div className="flex items-baseline gap-2.5 flex-wrap">
                    <span
                      className={`text-xs sm:text-sm font-semibold tracking-tight font-sans ${
                        isDone ? "text-[var(--text-muted)] line-through" : "text-[var(--text-primary)]"
                      }`}
                    >
                      {item.title}
                    </span>
                    {item.location && (
                      <span className="text-micro text-[var(--text-muted)] font-sans">
                        · {item.location}
                      </span>
                    )}
                  </div>

                  <span className="text-micro font-mono text-[var(--text-muted)] tabular-nums shrink-0">
                    {item.time}
                  </span>
                </div>

                {item.description && (
                  <div className="text-xs text-[var(--text-secondary)] mt-1 font-sans leading-relaxed overflow-x-auto break-words">
                    <FormattedMarkdown content={item.description} />
                  </div>
                )}
              </div>
            );
          })}
        </div>
        )}

        {/* 1-Click Adopt Strategy Banner - Centered Layout (Item 5) */}
        <div className="pt-2 flex flex-col items-center justify-center text-center gap-3 p-4 rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-surface)]/50 text-xs font-sans">
          <div className="space-y-1">
            <span className="font-semibold text-sm text-[var(--text-primary)] block">
              Adopt Strategy: Afternoon Deep Focus Block (3:00 PM – 5:00 PM)
            </span>
            <span className="text-[var(--text-muted)] block text-xs">
              Schedules a 2-hour focus sprint at {studySanctuary} with 1-click Undo recorded in Autopilot logs.
            </span>
          </div>

          <button
            onClick={() => handleAdoptPlan("plan-a")}
            disabled={adopting}
            className="px-4 py-2 rounded-lg text-xs font-semibold bg-[var(--accent-primary)] text-stone-950 hover:opacity-90 transition-colors duration-75 active:scale-[0.98] flex items-center justify-center gap-2 cursor-pointer shadow-xs disabled:opacity-50"
          >
            {adopting ? "Scheduling..." : "Adopt on Calendar"}
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>

        {adoptMsg && (
          <div className="p-2.5 rounded bg-[var(--semantic-success)]/10 border border-[var(--semantic-success)]/30 text-xs text-[var(--semantic-success)] font-sans text-center">
            {adoptMsg}
          </div>
        )}

        {/* Meditative Interstitial Quote (Item 3) */}
        <div className="pt-4 text-center max-w-lg mx-auto">
          <p className="font-serif italic text-xs sm:text-sm text-[var(--text-secondary)] leading-relaxed">
            "You have power over your mind — not outside events. Realize this, and you will find strength."
          </p>
          <span className="text-micro font-mono text-[var(--text-muted)] tracking-widest uppercase mt-1 block">
            — Marcus Aurelius, Meditations
          </span>
        </div>
      </section>

      {/* -------------------------------------------------------------------------- */}
      {/* 6. CURATED HORIZON & STUDY SANCTUARY                                       */}
      {/* -------------------------------------------------------------------------- */}
      <section className="py-6 border-y border-[var(--border-hairline)] space-y-6 max-w-2xl mx-auto">
        <div className="flex items-center justify-between text-xs text-[var(--text-muted)]">
          <span className="uppercase tracking-[0.18em] text-micro font-medium">
            Curated Horizon
          </span>
          <span className="text-micro font-serif italic text-[var(--accent-primary)]">
            Philosophy & Literary Mindset
          </span>
        </div>

        {/* Single Featured Book Spotlight (No Pills - Item 2 & Item 7) */}
        {featuredBook && (
          <div className="p-5 rounded-2xl border border-[var(--border-hairline)] bg-[var(--bg-surface)]/50 space-y-4 shadow-xs">
            <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
              <div className="space-y-1.5">
                <div className="flex items-center gap-2 flex-wrap">
                  {featuredBook.isUserChoice ? (
                    <span className="text-micro font-mono uppercase px-2 py-0.5 rounded bg-[var(--accent-primary)]/15 text-[var(--accent-primary)] border border-[var(--accent-primary)]/30 font-semibold">
                      ✦ Picked by You · Personal Shelf
                    </span>
                  ) : (
                    <span className="text-micro uppercase tracking-wider text-[var(--accent-primary)] font-mono font-semibold">
                      {featuredBook.category}
                    </span>
                  )}
                </div>

                <div className="flex items-baseline gap-2 flex-wrap">
                  <h3
                    className="text-lg sm:text-xl font-serif italic text-[var(--text-primary)] tracking-tight font-bold"
                    style={{ fontFamily: "var(--font-serif)" }}
                  >
                    {featuredBook.title}
                  </h3>
                  {featuredBook.author && (
                    <span className="text-xs text-[var(--text-muted)] font-sans">
                      by {featuredBook.author}
                    </span>
                  )}
                </div>
              </div>

              <button
                type="button"
                onClick={() => setShowBookDetails(!showBookDetails)}
                className="self-start sm:self-center px-3 py-1.5 rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-base)] text-xs font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:border-[var(--accent-primary)]/40 transition-colors duration-75 active:scale-[0.98] flex items-center gap-1.5 cursor-pointer shadow-xs shrink-0"
              >
                <span>{showBookDetails ? "Hide Details" : "See Topics & Summary"}</span>
                {showBookDetails ? (
                  <ChevronUp className="w-3.5 h-3.5" />
                ) : (
                  <ChevronDown className="w-3.5 h-3.5" />
                )}
              </button>
            </div>

            {/* Quick Teaser / Summary */}
            <p className="text-xs sm:text-sm text-[var(--text-secondary)] leading-relaxed font-sans pl-3 border-l-2 border-[var(--accent-primary)]/40">
              {featuredBook.summary}
            </p>

            {/* Expanded Topics, Summary, Relevance, and Iconic Quote (Item 6) */}
            {showBookDetails && (
              <div className="pt-3 border-t border-[var(--border-hairline)]/60 space-y-4">
                {/* Topic tags */}
                {featuredBook.topics && featuredBook.topics.length > 0 && (
                  <div className="space-y-1.5">
                    <span className="text-micro uppercase tracking-wider text-[var(--text-muted)] font-mono block">
                      Core Themes & Topics
                    </span>
                    <div className="flex flex-wrap gap-1.5">
                      {featuredBook.topics.map((t: string, i: number) => (
                        <span
                          key={i}
                          className="px-2 py-0.5 rounded text-micro font-medium bg-[var(--bg-base)] text-[var(--text-secondary)] border border-[var(--border-hairline)]"
                        >
                          #{t}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Relevance to Life-Ops */}
                {featuredBook.relevance && (
                  <div className="space-y-1">
                    <span className="text-micro uppercase tracking-wider text-[var(--text-muted)] font-mono block">
                      Life-Ops Perspective
                    </span>
                    <p className="text-xs text-[var(--text-secondary)] font-sans leading-relaxed">
                      {featuredBook.relevance}
                    </p>
                  </div>
                )}

                {/* Iconic Quote */}
                {featuredBook.quote && (
                  <div className="p-3.5 rounded-xl bg-[var(--accent-primary)]/10 border border-[var(--accent-primary)]/20 space-y-1.5">
                    <div className="flex items-center gap-1.5 text-[var(--accent-primary)]">
                      <Quote className="w-3 h-3" />
                      <span className="text-micro uppercase font-mono tracking-wider font-semibold">
                        Key Passage
                      </span>
                    </div>
                    <p className="font-serif italic text-xs sm:text-sm text-[var(--text-primary)] leading-relaxed pl-4">
                      "{featuredBook.quote}"
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Local Study Sanctuary */}
        <div className="p-4 sm:p-5 rounded-2xl border border-[var(--border-hairline)] bg-[var(--bg-surface)]/40 space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-[var(--border-hairline)]/60 pb-3">
            <div className="flex items-center gap-2.5">
              <div className="p-2 rounded-lg bg-amber-500/15 text-amber-400 border border-amber-500/30 shrink-0">
                <Coffee className="w-4 h-4" />
              </div>
              <div>
                <span className="text-micro font-mono uppercase tracking-wider text-[var(--text-muted)] block font-semibold">
                  Study Sanctuary · {locationLabel}
                </span>
                <h4 className="text-sm sm:text-base font-serif italic text-[var(--text-primary)] font-bold">
                  {brief?.study_sanctuary?.name || studySanctuary}
                </h4>
              </div>
            </div>

            <div className="flex items-center gap-2 self-start sm:self-center">
              <span className="text-micro font-mono px-2 py-0.5 rounded bg-[var(--bg-base)] text-[var(--text-secondary)] border border-[var(--border-hairline)]">
                {brief?.study_sanctuary?.distance || "Nearby quiet workspace"}
              </span>
              <span className="text-micro font-mono text-[var(--accent-primary)] font-semibold">
                {brief?.study_sanctuary?.noise_level || "Quiet focus environment"}
              </span>
            </div>
          </div>

          <p className="text-xs text-[var(--text-secondary)] font-sans leading-relaxed">
            {brief?.study_sanctuary?.features ||
              "Step away from primary screens today. A calm workspace for focused reading, assignment proofreads, or a 45-minute mental reset."}
          </p>

          <div className="flex flex-wrap items-center gap-1.5 pt-1 text-micro text-[var(--text-muted)] font-mono">
            <span className="px-2 py-0.5 rounded bg-[var(--bg-base)] border border-[var(--border-hairline)]">#QuietWorkspace</span>
            <span className="px-2 py-0.5 rounded bg-[var(--bg-base)] border border-[var(--border-hairline)]">#DeepFocus</span>
            <span className="px-2 py-0.5 rounded bg-[var(--bg-base)] border border-[var(--border-hairline)]">#AmbientReset</span>
          </div>
        </div>
      </section>

      {/* -------------------------------------------------------------------------- */}
      {/* CAMPUS PULSE & DAILY CURIOSITY (NEWS & ENGINEERING TRIVIA - Item 4)        */}
      {/* -------------------------------------------------------------------------- */}
      <section className="space-y-4 max-w-2xl mx-auto">
        <div className="flex items-center justify-between pb-2 border-b border-[var(--border-hairline)] text-xs text-[var(--text-muted)]">
          <div className="flex items-center gap-2">
            <Compass className="w-3.5 h-3.5 text-[var(--accent-primary)]" />
            <span className="uppercase tracking-[0.2em] text-micro font-medium">
              Local Pulse & Daily Curiosity
            </span>
          </div>
          <span className="text-micro font-mono text-[var(--text-muted)]">
            {academicProfile}
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Card A: Local & Campus Dispatch */}
          <div className="p-4 sm:p-5 rounded-2xl border border-[var(--border-hairline)] bg-[var(--bg-surface)]/40 space-y-3 flex flex-col justify-between">
            <div className="space-y-2.5">
              <div className="flex items-center gap-2">
                <Newspaper className="w-4 h-4 text-[var(--accent-primary)]" />
                <span className="text-micro font-mono uppercase tracking-wider text-[var(--text-primary)] font-bold">
                  {isDemo
                    ? PERSONA.newsDispatch
                    : profile?.institution?.trim()
                    ? `${profile.institution.trim()} Dispatch`
                    : "Local & Campus Pulse"}
                </span>
              </div>

              <div className="space-y-2 text-xs font-sans">
                {Array.isArray(brief?.dispatch_news) && brief.dispatch_news.length > 0 ? (
                  brief.dispatch_news.map((item: any, idx: number) => (
                    <div
                      key={idx}
                      className={`border-l-2 pl-2.5 py-0.5 ${
                        idx === 0 ? "border-[var(--accent-primary)]/40" : "border-[var(--border-hairline)]"
                      }`}
                    >
                      <span className="font-semibold text-[var(--text-primary)] block">
                        {item.headline}
                      </span>
                      <p className="text-micro text-[var(--text-secondary)] mt-0.5 leading-relaxed">
                        {[item.source, item.date].filter(Boolean).join(" · ")}
                      </p>
                    </div>
                  ))
                ) : (
                  <>
                    <div className="border-l-2 border-[var(--accent-primary)]/40 pl-2.5 py-0.5">
                      <span className="font-semibold text-[var(--text-primary)] block">
                        Midday Outdoor Reset Window
                      </span>
                      <p className="text-micro text-[var(--text-secondary)] mt-0.5 leading-relaxed">
                        Take a 15-minute walk between work blocks around {locationLabel} to reset attention before afternoon deep work.
                      </p>
                    </div>

                    <div className="border-l-2 border-[var(--border-hairline)] pl-2.5 py-0.5">
                      <span className="font-semibold text-[var(--text-primary)] block">
                        Upcoming Deadlines Check-In
                      </span>
                      <p className="text-micro text-[var(--text-secondary)] mt-0.5 leading-relaxed">
                        Review synced Canvas deliverables early so study blocks stay flexible and unhurried.
                      </p>
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>

          {/* Card B: Systems Architecture, Philosophy & Campus Lore Trivia (Randomized & Dynamic) */}
          <div className="p-4 sm:p-5 rounded-2xl border border-[var(--border-hairline)] bg-[var(--bg-surface)]/40 space-y-3 flex flex-col justify-between">
            <div className="space-y-2.5">
              <div className="flex items-center justify-between gap-2 border-b border-[var(--border-hairline)]/50 pb-2.5">
                <div className="flex items-center gap-2 min-w-0">
                  <Lightbulb className="w-4 h-4 text-amber-400 shrink-0" />
                  <span className="text-micro font-mono uppercase tracking-wider text-[var(--text-primary)] font-bold truncate">
                    {curiosity?.tag || "Systems & Campus Lore"}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={handleShuffleCuriosity}
                  disabled={isShufflingFact}
                  title="Shuffle a new random curiosity fact"
                  className="px-2.5 py-1 rounded-md border border-[var(--border-hairline)] bg-[var(--bg-base)] hover:border-[var(--accent-primary)]/50 text-[var(--text-secondary)] hover:text-[var(--text-primary)] text-micro font-mono flex items-center gap-1.5 transition-all cursor-pointer shadow-xs disabled:opacity-50 shrink-0"
                >
                  <RefreshCw className={`w-3 h-3 ${isShufflingFact ? "animate-spin text-[var(--accent-primary)]" : ""}`} />
                  <span>{isShufflingFact ? "Shuffling..." : "New Fact"}</span>
                </button>
              </div>

              <h5
                className="font-serif italic text-base sm:text-lg text-[var(--text-primary)] leading-snug"
                style={{ fontFamily: "var(--font-serif)" }}
              >
                {curiosity?.title || brief?.curiosity?.title || "The 1962 Origins of Virtual Memory"}
              </h5>

              <p className="text-xs text-[var(--text-secondary)] font-sans leading-relaxed">
                {curiosity?.did_you_know || brief?.curiosity?.did_you_know}
              </p>

              <p className="text-xs text-[var(--text-muted)] font-sans leading-relaxed pl-2.5 border-l-2 border-amber-400/40">
                {curiosity?.reflection || brief?.curiosity?.reflection}
              </p>
            </div>

            <div className="pt-2 text-micro font-mono text-[var(--text-muted)] border-t border-[var(--border-hairline)]/60 flex items-center justify-between gap-2">
              <span className="truncate">{curiosity?.footnote || brief?.curiosity?.footnote || "CS 2506 Systems Trivia · Atlas Computer, 1962"}</span>
              <span className="text-micro font-mono text-amber-400/80 shrink-0 pl-1">✦ 32 Facts</span>
            </div>
          </div>
        </div>
      </section>

      {/* -------------------------------------------------------------------------- */}
      {/* 7. DIRECT LINE ASSISTANT & PERSONAL KNOWLEDGE BASE (INTERACTIVE INPUT)     */}
      {/* -------------------------------------------------------------------------- */}
      <section className="space-y-6 max-w-2xl mx-auto pt-2">
        <div className="flex items-center justify-between pb-2 border-b border-[var(--border-hairline)] text-xs text-[var(--text-muted)]">
          <div className="flex items-center gap-2">
            <span className="uppercase tracking-[0.18em] text-micro font-medium">
              Direct Line & Personal Knowledge Base
            </span>
            <Link
              href="/assistant"
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-micro font-sans text-[var(--accent-primary)] bg-[var(--accent-primary)]/10 hover:bg-[var(--accent-primary)]/20 border border-[var(--accent-primary)]/30 transition-colors"
              title="Open full interactive assistant"
            >
              <span>Assistant Page</span>
              <ExternalLink className="w-3 h-3" />
            </Link>
          </div>
          <span className="text-micro text-[var(--accent-primary)] font-mono">
            {knowledge.length} items logged
          </span>
        </div>

        {/* The Co-Star style direct conversation input */}
        <div className="space-y-3">
          <form
            onSubmit={handleDirectSubmit}
            className="relative flex items-center rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-surface)]/60 focus-within:border-[var(--accent-primary)] focus-within:bg-[var(--bg-surface)] transition-all p-1.5"
          >
            <input
              type="text"
              value={directInput}
              onChange={(e) => setDirectInput(e.target.value)}
              placeholder="Tell your assistant anything ('Where do I live?', 'Schedule gym at 6 PM', 'I live at 120 College Park Ave...')..."
              className="flex-1 px-3 py-2 text-xs sm:text-sm bg-transparent text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-hidden font-sans"
            />
            <button
              type="submit"
              disabled={directLoading || !directInput.trim()}
              className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-[var(--accent-primary)] text-stone-950 hover:opacity-90 transition-opacity flex items-center gap-1 cursor-pointer disabled:opacity-40 shrink-0 font-sans"
            >
              <span>{directLoading ? "Saving..." : "Send"}</span>
              <Send className="w-3 h-3" />
            </button>
          </form>

          {/* Quick preset suggestion chips */}
          <div className="flex flex-wrap items-center gap-1.5 text-micro">
            <span className="text-[var(--text-muted)] mr-1">Quick ideas:</span>
            {[
              "Where do I live?",
              "Schedule gym workout at 6 PM",
              "I want to read The Stranger by Albert Camus",
              "Note: review CS 2506 TLB page size formulas",
            ].map((chip, i) => (
              <button
                key={i}
                type="button"
                onClick={() => setDirectInput(chip)}
                className="px-2 py-0.5 rounded border border-[var(--border-hairline)] bg-[var(--bg-base)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:border-[var(--accent-primary)] transition-colors cursor-pointer"
              >
                + {chip.slice(0, 32)}...
              </button>
            ))}
          </div>

          {/* Response Notification Banner */}
          {directResponse && (
            <div className="p-3.5 rounded-lg bg-[var(--accent-primary)]/10 border border-[var(--accent-primary)]/30 text-xs text-[var(--text-primary)] font-sans animate-in fade-in space-y-3">
              <div className="flex items-center gap-2">
                <Sparkles className="w-3.5 h-3.5 text-[var(--accent-primary)]" />
                <span className="font-semibold text-[var(--accent-primary)] tracking-wide uppercase text-micro">
                  Assistant Response
                </span>
              </div>
              <div className="text-xs text-[var(--text-primary)] leading-relaxed pl-5 border-l border-[var(--accent-primary)]/40 font-sans">
                <FormattedMarkdown content={directResponse} />
              </div>

              {/* Proposed Event Card (Interactive) */}
              {directProposedEvent && (
                <div className="p-3.5 rounded-lg bg-[var(--bg-base)] border border-[var(--border-hairline)] space-y-2 mt-2">
                  <div className="flex items-center justify-between text-micro font-mono">
                    <span className="text-[var(--accent-primary)] uppercase tracking-wider font-semibold flex items-center gap-1">
                      <Calendar className="w-3 h-3" />
                      Proposed Calendar Event
                    </span>
                    <span className="text-[var(--text-muted)]">
                      {directProposedEvent.date}
                    </span>
                  </div>
                  <div className="flex items-start justify-between gap-2">
                    <h5 className="font-semibold text-xs text-[var(--text-primary)]">
                      {directProposedEvent.summary}
                    </h5>
                    <span className="text-micro font-mono text-[var(--accent-primary)] bg-[var(--accent-primary)]/15 px-1.5 py-0.5 rounded shrink-0">
                      {directProposedEvent.formatted_time}
                    </span>
                  </div>
                  {directProposedEvent.location && (
                    <div className="flex items-center gap-1 text-micro text-[var(--text-muted)]">
                      <MapPin className="w-3 h-3 text-[var(--accent-primary)] shrink-0" />
                      <span>{directProposedEvent.location}</span>
                    </div>
                  )}
                  <div className="pt-1">
                    {eventCommitted ? (
                      <div className="w-full py-1.5 px-2.5 rounded bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 text-micro font-medium flex items-center justify-center gap-1.5">
                        <Check className="w-3.5 h-3.5" />
                        <span>Added to Calendar · 1-click Undo in Logs</span>
                      </div>
                    ) : (
                      <button
                        type="button"
                        disabled={eventCommitting}
                        onClick={handleCommitDirectEvent}
                        className="w-full py-1.5 px-2.5 rounded bg-[var(--accent-primary)] text-stone-950 font-semibold text-micro hover:opacity-90 transition-opacity flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
                      >
                        {eventCommitting ? (
                          <>
                            <RefreshCw className="w-3 h-3 animate-spin" />
                            <span>Adding to Calendar...</span>
                          </>
                        ) : (
                          <>
                            <Calendar className="w-3 h-3" />
                            <span>Add this to Calendar</span>
                          </>
                        )}
                      </button>
                    )}
                  </div>
                </div>
              )}

              {/* Saved Facts Notice */}
              {directSavedFacts && directSavedFacts.length > 0 && (
                <div className="pt-2 border-t border-[var(--accent-primary)]/20 space-y-1.5">
                  <span className="text-[10px] font-mono text-[var(--accent-primary)] uppercase tracking-wider font-semibold block">
                    ✦ Saved to Memory
                  </span>
                  {directSavedFacts.map((f, i) => (
                    <div
                      key={i}
                      className="p-2 rounded bg-[var(--bg-base)] border border-[var(--border-hairline)] text-micro flex items-center justify-between"
                    >
                      <span className="text-[var(--text-primary)] font-medium">
                        {f.title}: {f.content}
                      </span>
                      <span className="text-[9px] font-mono uppercase text-[var(--accent-primary)] bg-[var(--accent-primary)]/15 px-1 rounded">
                        {f.category}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Curated Recommendations (if suggested by Assistant) */}
          {directRecommendations && directRecommendations.length > 0 && (
            <div className="space-y-3 pt-2 animate-in fade-in">
              <div className="flex items-center justify-between text-xs text-[var(--text-muted)] pb-1 border-b border-[var(--border-hairline)]">
                <span className="uppercase tracking-[0.18em] text-micro font-medium text-[var(--accent-primary)]">
                  Curated Recommendations
                </span>
                <span className="text-micro text-[var(--text-muted)]">
                  1-Click Add to Reading List
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {directRecommendations.map((book, idx) => (
                  <div
                    key={idx}
                    className="p-3.5 rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-surface)]/60 hover:border-[var(--accent-primary)]/50 transition-all flex flex-col justify-between gap-3 group"
                  >
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-micro font-sans font-medium uppercase tracking-wider px-1.5 py-0.5 rounded bg-[var(--accent-primary)]/15 text-[var(--accent-primary)] border border-[var(--accent-primary)]/30">
                          {book.category || "Recommendation"}
                        </span>
                        <span className="text-micro text-[var(--text-muted)] font-sans truncate">
                          {book.author}
                        </span>
                      </div>
                      <h5
                        className="font-serif italic text-sm text-[var(--text-primary)] leading-snug"
                        style={{ fontFamily: "var(--font-serif)" }}
                      >
                        {book.title}
                      </h5>
                      <p className="text-micro text-[var(--text-secondary)] leading-relaxed font-sans line-clamp-3">
                        {book.reason || book.note}
                      </p>
                    </div>

                    <button
                      type="button"
                      onClick={() => handleAddRecommendedBook(book)}
                      className="w-full py-1.5 px-2.5 rounded-md bg-[var(--bg-base)] group-hover:bg-[var(--accent-primary)] group-hover:text-stone-950 text-[var(--text-primary)] border border-[var(--border-hairline)] text-micro font-medium transition-colors flex items-center justify-center gap-1.5 cursor-pointer shadow-xs"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>Add to Reading List</span>
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Live Personal Knowledge Base & Reading List */}
        {knowledge.length > 0 && (
          <div className="space-y-3 pt-2">
            <span className="text-micro uppercase tracking-wider text-[var(--text-muted)] font-medium block">
              Active Reading List, Notes & Preferences
            </span>

            <div className="space-y-2">
              {knowledge.map((item) => {
                const isReading = item.category === "reading_list";
                const isPref = item.category === "preference";
                let author = typeof item.metadata === "string" 
                  ? (() => { try { return JSON.parse(item.metadata).author; } catch(e) { return null; } })()
                  : item.metadata?.author;
                if (!author || author.toLowerCase().includes("selected")) {
                  if (item.title.toLowerCase().includes("klara")) author = "Kazuo Ishiguro";
                  else if (item.title.toLowerCase().includes("stranger")) author = "Albert Camus";
                  else if (item.title.toLowerCase().includes("sisyphus")) author = "Albert Camus";
                  else if (item.title.toLowerCase().includes("meditations")) author = "Marcus Aurelius";
                }

                return (
                  <div
                    key={item.id}
                    className="p-3 rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-surface)]/30 flex items-start justify-between gap-3 text-xs font-sans group hover:border-[var(--border-hairline)]/80 transition-colors"
                  >
                    <div className="space-y-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span
                          className={`px-1.5 py-0.2 rounded text-[10px] font-medium uppercase tracking-wider ${
                            isReading
                              ? "bg-[var(--accent-primary)]/15 text-[var(--accent-primary)] border border-[var(--accent-primary)]/30"
                              : isPref
                              ? "bg-purple-500/15 text-purple-400 border border-purple-500/30"
                              : "bg-[var(--bg-base)] text-[var(--text-secondary)] border border-[var(--border-hairline)]"
                          }`}
                        >
                          {isReading ? "Reading List" : isPref ? "Preference" : "Note"}
                        </span>
                        <h4
                          className="font-serif italic text-sm text-[var(--text-primary)] truncate"
                          style={{ fontFamily: "var(--font-serif)" }}
                        >
                          {item.title}
                        </h4>
                        {author && (
                          <span className="text-micro text-[var(--text-muted)] hidden sm:inline">
                            · {author}
                          </span>
                        )}
                      </div>

                      {item.content && item.content !== item.title && (
                        <p className="text-micro text-[var(--text-secondary)] pl-2 border-l border-[var(--border-hairline)] leading-relaxed">
                          {item.content}
                        </p>
                      )}
                    </div>

                    <button
                      onClick={() => handleDeleteKnowledge(item.id)}
                      className="p-1 rounded text-[var(--text-muted)] opacity-0 group-hover:opacity-100 hover:text-[var(--semantic-danger)] transition-all cursor-pointer"
                      title="Remove entry"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </section>

      {/* -------------------------------------------------------------------------- */}
      {/* 8. FOOTER / TRANQUIL SIGN-OFF                                             */}
      {/* -------------------------------------------------------------------------- */}
      <footer className="pt-12 pb-6 text-center border-t border-[var(--border-hairline)] text-micro text-[var(--text-muted)] space-y-2">
        <p className="font-serif italic text-sm text-[var(--text-secondary)]">
          "One focus sprint at a time. The rest is noise."
        </p>
        <p className="font-mono tabular-nums text-[10px]">
          Life-Ops Autonomous Assistant · {academicProfile}
        </p>
      </footer>

      {/* Academic Assignment Detail & Spec Pop-out Modal */}
      <AssignmentDetailModal
        isOpen={isDetailModalOpen}
        onClose={() => setIsDetailModalOpen(false)}
        assignment={selectedAssignment}
        onToggleSubmit={() => loadData()}
        onAnalyzed={() => loadData()}
      />

      {/* Timeline Event Detail Modal */}
      <EventDetailModal
        isOpen={isEventModalOpen}
        onClose={() => {
          setIsEventModalOpen(false);
          setSelectedEvent(null);
        }}
        event={selectedEvent}
        onUpdate={(updated) => {
          setSelectedEvent(updated);
          loadData();
        }}
        onDelete={() => {
          setIsEventModalOpen(false);
          setSelectedEvent(null);
          loadData();
        }}
      />
    </div>
  );
}
