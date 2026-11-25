"use client";

import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from "react";
import {
  getAssignments,
  getUserProfile,
  type UserProfile,
  type SetupStatus,
} from "@/lib/api";

export interface ProfileContextValue {
  profile: UserProfile | null;
  setupStatus: SetupStatus | null;
  loading: boolean;
  refreshProfile: () => Promise<void>;
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

function computeInitials(name: string, fallback = "LO"): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return fallback;
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

const defaultContextValue: ProfileContextValue = {
  profile: null,
  setupStatus: null,
  loading: true,
  refreshProfile: async () => {},
  displayName: "Life-Ops",
  firstName: "there",
  initials: "LO",
  termLabel: "Current Term",
  locationLabel: "Local Time",
  canvasUrl: "https://canvas.instructure.com",
  studySanctuary: "Local Study Spot",
  academicProfile: "Academic Ops",
  activeAssignmentsCount: 0,
};

const ProfileContext = createContext<ProfileContextValue>(defaultContextValue);

export function ProfileProvider({ children }: { children: React.ReactNode }) {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [setupStatus, setSetupStatus] = useState<SetupStatus | null>(null);
  const [activeAssignmentsCount, setActiveAssignmentsCount] = useState<number>(0);
  const [loading, setLoading] = useState<boolean>(true);

  const refreshProfile = useCallback(async () => {
    try {
      const data = await getUserProfile();
      const rawProfile = (data?.profile ?? data ?? null) as UserProfile | null;
      const rawStatus = (data?.setup_status ?? null) as SetupStatus | null;

      if (rawProfile) {
        setProfile(rawProfile);
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
      console.error("Failed to load user profile:", err);
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

    return () => {
      window.removeEventListener("lifeops-profile-updated", handleUpdate);
      window.removeEventListener("lifeops-refresh-calendar", handleUpdate);
    };
  }, [refreshProfile]);

  const value = useMemo<ProfileContextValue>(() => {
    const fullName = profile?.full_name?.trim() || "";
    const displayName = fullName || "Life-Ops User";
    const firstName =
      profile?.first_name?.trim() ||
      (fullName ? fullName.split(/\s+/)[0] : "") ||
      "there";
    const initials = fullName ? computeInitials(fullName) : "LO";
    const termLabel = profile?.term_label?.trim() || "Current Term";

    const cityRegion = [profile?.city?.trim(), profile?.region?.trim()]
      .filter(Boolean)
      .join(", ");
    const locationLabel = cityRegion || "Local Time";

    const canvasUrl =
      profile?.canvas_base_url?.trim() || "https://canvas.instructure.com";

    const studySanctuary =
      profile?.study_sanctuary?.trim() || "Quiet Study Workspace";

    const institutionPart = profile?.institution?.trim();
    const academicProfile =
      [institutionPart, termLabel].filter(Boolean).join(" · ") || "Academic Ops";

    return {
      profile,
      setupStatus,
      loading,
      refreshProfile,
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
  }, [profile, setupStatus, loading, refreshProfile, activeAssignmentsCount]);

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
