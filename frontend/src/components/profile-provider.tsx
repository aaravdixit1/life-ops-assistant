"use client";

import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from "react";
import {
  getAssignments,
  getUserProfile,
  type UserProfile,
  type SetupStatus,
} from "@/lib/api";
import { IS_DEMO_MODE, isDemoMode } from "@/lib/demo-mode";
import { PERSONA } from "@/lib/persona";

export interface ProfileContextValue {
  profile: UserProfile | null;
  setupStatus: SetupStatus | null;
  loading: boolean;
  refreshProfile: () => Promise<void>;
  isDemo: boolean;
  displayName: string;
  firstName: string;
  initials: string;
  termLabel: string;
  locationLabel: string;
  canvasUrl: string;
  studySanctuary: string;
  academicProfile: string;
  activeAssignmentsCount: number;
}

const DEMO_FALLBACK_PROFILE: UserProfile = {
  id: "default",
  full_name: PERSONA.name,
  first_name: PERSONA.firstName,
  institution: "Tech Institute",
  term_label: PERSONA.termLabel,
  major_or_role: "B.S. Computer Science & Systems Engineering",
  majors: ["Computer Science", "Systems Engineering"],
  minors: ["Mathematics"],
  academic_year: "Junior",
  expected_graduation: "May 2027",
  career_role: "Software Engineering Intern",
  city: PERSONA.campusTown,
  region: "",
  timezone: "America/New_York",
  latitude: 42.3601,
  longitude: -71.0589,
  grocery_radius_miles: 5,
  wake_time: "08:30",
  sleep_time: "23:30",
  study_sanctuary: PERSONA.studySanctuary,
  canvas_base_url: PERSONA.canvasUrl,
  canvas_ics_url: "https://canvas.instructure.com/feeds/calendars/demo_feed.ics",
  daily_calories_target: 2600,
  daily_protein_g: 155,
  daily_carbs_g: 320,
  daily_fats_g: 75,
  dietary_notes: "High-protein lean bulk · No beef · Rare pork",
  onboarding_completed: true,
};

function computeInitials(name: string, fallback = "LO"): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return fallback;
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

const defaultContextValue: ProfileContextValue = {
  profile: IS_DEMO_MODE ? DEMO_FALLBACK_PROFILE : null,
  setupStatus: IS_DEMO_MODE
    ? {
        profile_configured: true,
        canvas_configured: true,
        calendar_feeds_count: 2,
        google_oauth_configured: false,
        active_assignments_count: 5,
        onboarding_completed: true,
      }
    : null,
  loading: !IS_DEMO_MODE,
  refreshProfile: async () => {},
  isDemo: IS_DEMO_MODE,
  displayName: IS_DEMO_MODE ? PERSONA.name : "Life-Ops",
  firstName: IS_DEMO_MODE ? PERSONA.firstName : "there",
  initials: IS_DEMO_MODE ? PERSONA.initials : "LO",
  termLabel: IS_DEMO_MODE ? PERSONA.termLabel : "Current Term",
  locationLabel: IS_DEMO_MODE ? PERSONA.campusTown : "Local Time",
  canvasUrl: PERSONA.canvasUrl,
  studySanctuary: IS_DEMO_MODE ? PERSONA.studySanctuary : "Local Study Spot",
  academicProfile: IS_DEMO_MODE ? PERSONA.academicProfile : "Academic Ops",
  activeAssignmentsCount: IS_DEMO_MODE ? 5 : 0,
};

const ProfileContext = createContext<ProfileContextValue>(defaultContextValue);

export function ProfileProvider({ children }: { children: React.ReactNode }) {
  const [isDemo, setIsDemo] = useState<boolean>(IS_DEMO_MODE);
  const [profile, setProfile] = useState<UserProfile | null>(
    IS_DEMO_MODE ? DEMO_FALLBACK_PROFILE : null
  );
  const [setupStatus, setSetupStatus] = useState<SetupStatus | null>(
    defaultContextValue.setupStatus
  );
  const [activeAssignmentsCount, setActiveAssignmentsCount] = useState<number>(
    IS_DEMO_MODE ? 5 : 0
  );
  const [loading, setLoading] = useState<boolean>(!IS_DEMO_MODE);

  const refreshProfile = useCallback(async () => {
    const demoActive = isDemoMode();
    setIsDemo(demoActive);

    try {
      const data = await getUserProfile();
      const rawProfile = (data?.profile ?? data ?? null) as UserProfile | null;
      const rawStatus = (data?.setup_status ?? null) as SetupStatus | null;

      if (rawProfile) {
        setProfile(rawProfile);
      } else if (demoActive) {
        setProfile(DEMO_FALLBACK_PROFILE);
      }

      if (rawStatus) {
        setSetupStatus(rawStatus);
      }

      if (typeof rawStatus?.active_assignments_count === "number") {
        setActiveAssignmentsCount(rawStatus.active_assignments_count);
      } else {
        try {
          const activeList = await getAssignments("active");
          if (Array.isArray(activeList)) {
            setActiveAssignmentsCount(activeList.length);
          }
        } catch {
          // Non-fatal fallback if assignments endpoint unavailable during initial setup
        }
      }
    } catch (err) {
      if (demoActive) {
        setProfile(DEMO_FALLBACK_PROFILE);
      } else {
        console.error("Failed to load user profile:", err);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshProfile();

    const handleUpdate = () => {
      refreshProfile();
    };

    window.addEventListener("lifeops-profile-updated", handleUpdate);
    window.addEventListener("lifeops-refresh-calendar", handleUpdate);
    window.addEventListener("lifeops-demo-reset", handleUpdate);

    return () => {
      window.removeEventListener("lifeops-profile-updated", handleUpdate);
      window.removeEventListener("lifeops-refresh-calendar", handleUpdate);
      window.removeEventListener("lifeops-demo-reset", handleUpdate);
    };
  }, [refreshProfile]);

  const value = useMemo<ProfileContextValue>(() => {
    const fullName = profile?.full_name?.trim() || "";
    const displayName = fullName || (isDemo ? PERSONA.name : "Life-Ops User");
    const firstName =
      profile?.first_name?.trim() ||
      (fullName ? fullName.split(/\s+/)[0] : "") ||
      (isDemo ? PERSONA.firstName : "there");
    const initials = fullName
      ? computeInitials(fullName)
      : isDemo
      ? PERSONA.initials
      : "LO";
    const termLabel =
      profile?.term_label?.trim() || (isDemo ? PERSONA.termLabel : "Current Term");

    const cityRegion = [profile?.city?.trim(), profile?.region?.trim()]
      .filter(Boolean)
      .join(", ");
    const locationLabel =
      cityRegion || (isDemo ? PERSONA.campusTown : "Local Time");

    const canvasUrl =
      profile?.canvas_base_url?.trim() || PERSONA.canvasUrl;

    const studySanctuary =
      profile?.study_sanctuary?.trim() ||
      (isDemo ? PERSONA.studySanctuary : "Quiet Study Workspace");

    const institutionPart = profile?.institution?.trim();
    const academicProfile =
      [institutionPart, termLabel].filter(Boolean).join(" · ") ||
      (isDemo ? PERSONA.academicProfile : "Academic Ops");

    return {
      profile,
      setupStatus,
      loading,
      refreshProfile,
      isDemo,
      displayName,
      firstName,
      initials,
      termLabel,
      locationLabel,
      canvasUrl,
      studySanctuary,
      academicProfile,
      activeAssignmentsCount,
    };
  }, [profile, setupStatus, loading, refreshProfile, isDemo, activeAssignmentsCount]);

  useEffect(() => {
    if (typeof document === "undefined") return;
    if (!loading) {
      document.title = `Life-Ops Assistant · ${value.displayName} (${value.termLabel})`;
    }
  }, [loading, value.displayName, value.termLabel]);

  return (
    <ProfileContext.Provider value={value}>
      {children}
    </ProfileContext.Provider>
  );
}

export function useProfile(): ProfileContextValue {
  return useContext(ProfileContext);
}
