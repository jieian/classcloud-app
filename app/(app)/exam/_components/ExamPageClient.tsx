"use client";

import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { useMediaQuery } from "@mantine/hooks";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Text,
  Card,
  Select,
  Button,
  Badge,
  Group,
  Tooltip,
  Stack,
  Box,
  SimpleGrid,
  Accordion,
  ActionIcon,
  Menu,
  Skeleton,
  Alert,
  Divider,
  Modal,
  TextInput,
  Pagination,
  Center,
  ThemeIcon,
  SegmentedControl,
} from "@mantine/core";
import {
  IconDownload,
  IconTrash,
  IconAlertCircle,
  IconRefreshDot,
  IconRefresh,
  IconSchool,
  IconSettings,
  IconUsers,
  IconBook,
  IconBinoculars,
  IconUser,
  IconCopy,
  IconClipboardOff,
} from "@tabler/icons-react";
import { notify } from "@/components/notificationIcon/notificationIcon";
import ViewExamDetailsModal from "@/components/ViewExamDetailsModal";
import CopyExamModal from "@/components/CopyExamModal";

import { generateAnswerSheetPdf } from "@/lib/services/examPdfService";
import {
  fetchExamsWithRelations,
  fetchExamGradingData,
  setExamLocked,
  deleteExamWithAssignments,
} from "@/lib/services/examService";
import type { ExamWithRelations, GradeLevel, Section } from "@/lib/exam-supabase";
import { useAuth } from "@/context/AuthContext";
import { fetchTeacherClassAssignments } from "@/lib/services/classService";
import type { SubjectWithGradeLevel } from "@/lib/services/subjectService";
import type { ExamInitialData } from "@/app/(app)/exam/_lib/examServerService";
import { SearchBar } from "@/components/searchBar/SearchBar";
import NoActivePeriodBanner from "@/components/NoActivePeriodBanner";
import EmptySearchState from "@/components/EmptySearchState";

const EXAM_BROWSER_STORAGE_PREFIX = "exam:browser";

function makeExamStorageKey(
  userId: string | undefined,
  viewMode: "admin" | "faculty",
  key: string,
) {
  return userId ? `${EXAM_BROWSER_STORAGE_PREFIX}:${userId}:${viewMode}:${key}` : null;
}

function getAppShellScrollContainer(): HTMLElement | null {
  if (typeof document === "undefined") return null;
  const main = document.querySelector("main");
  return main instanceof HTMLElement ? main : null;
}

function saveExamScrollPosition(storageKey: string | null) {
  if (!storageKey || typeof window === "undefined") return;
  const scrollContainer = getAppShellScrollContainer();
  const scrollTop = scrollContainer?.scrollTop ?? window.scrollY;
  window.sessionStorage.setItem(storageKey, String(scrollTop));
}

function restoreExamScrollPosition(storageKey: string | null) {
  if (!storageKey || typeof window === "undefined") return;
  const raw = window.sessionStorage.getItem(storageKey);
  if (!raw) return;
  const scrollTop = Number(raw);
  if (!Number.isFinite(scrollTop)) return;

  const restore = () => {
    const scrollContainer = getAppShellScrollContainer();
    if (scrollContainer) {
      scrollContainer.scrollTop = scrollTop;
      return;
    }
    window.scrollTo({ top: scrollTop });
  };

  requestAnimationFrame(() => {
    requestAnimationFrame(restore);
  });
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function isExamArray(value: unknown): value is ExamWithRelations[] {
  return Array.isArray(value);
}

type TeacherAssignmentCache = {
  section_id: number;
  curriculum_subject_id: number;
  subject_id: number;
};

function isTeacherAssignmentArray(value: unknown): value is TeacherAssignmentCache[] {
  return (
    Array.isArray(value) &&
    value.every(
      (item) =>
        item != null &&
        typeof item === "object" &&
        typeof (item as TeacherAssignmentCache).section_id === "number" &&
        typeof (item as TeacherAssignmentCache).curriculum_subject_id === "number" &&
        typeof (item as TeacherAssignmentCache).subject_id === "number",
    )
  );
}

function makeExamScopeKey(sectionIds?: number[]) {
  return sectionIds == null
    ? "all"
    : [...sectionIds].sort((a, b) => a - b).join(",") || "none";
}

function readStoredExamList(storageKey: string | null, scopeKey: string) {
  if (!storageKey || typeof window === "undefined") {
    return { hasCache: false, exams: [] as ExamWithRelations[] };
  }
  try {
    const raw = window.sessionStorage.getItem(storageKey);
    if (!raw) return { hasCache: false, exams: [] as ExamWithRelations[] };
    const parsed = JSON.parse(raw) as unknown;
    if (
      parsed != null &&
      typeof parsed === "object" &&
      (parsed as { scopeKey?: unknown }).scopeKey === scopeKey &&
      isExamArray((parsed as { exams?: unknown }).exams)
    ) {
      return { hasCache: true, exams: (parsed as { exams: ExamWithRelations[] }).exams };
    }
  } catch {
    // Ignore malformed storage payloads.
  }
  return { hasCache: false, exams: [] as ExamWithRelations[] };
}

function readStoredExamState<T>(
  storageKey: string | null,
  fallback: T,
  validate: (value: unknown) => value is T,
): T {
  if (!storageKey || typeof window === "undefined") return fallback;
  try {
    const raw = window.sessionStorage.getItem(storageKey);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw) as unknown;
    return validate(parsed) ? parsed : fallback;
  } catch {
    return fallback;
  }
}

export default function ExamPageClient({ initialData }: { initialData: ExamInitialData | null }) {
  const router = useRouter();
  const isMobile = useMediaQuery('(max-width: 768px)');
  const searchParams = useSearchParams();
  const { user, roles, permissions, loading: authLoading, firstName, lastName } =
    useAuth();
  const [exams, setExams] = useState<ExamWithRelations[]>([]);
  const [filteredExams, setFilteredExams] = useState<ExamWithRelations[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedGradeLevel, setSelectedGradeLevel] = useState("");
  const [selectedSection, setSelectedSection] = useState("");
  const [selectedSubject, setSelectedSubject] = useState("");
  const [isViewDetailsOpen, setIsViewDetailsOpen] = useState(false);
  const [isCopyExamOpen, setIsCopyExamOpen] = useState(false);
  const [selectedExam, setSelectedExam] = useState<ExamWithRelations | null>(
    null,
  );
  const [loading, setLoading] = useState(true);
  const [dbError, setDbError] = useState<string | null>(null);
  const [updatingStatus, setUpdatingStatus] = useState<number | null>(null);
  const [deleteOpened, setDeleteOpened] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [examToDelete, setExamToDelete] = useState<ExamWithRelations | null>(
    null,
  );
  // null = not yet loaded (hide delete on all exams); Set = loaded (hide only scanned exams)
  const [examIdsWithScores, setExamIdsWithScores] = useState<Set<number> | null>(null);

  /** Exam ID to highlight after creation flow completes */
  const [newlyCreatedExamIds, setNewlyCreatedExamIds] = useState<Set<number>>(
    new Set(),
  );
  const [highlightExpiring, setHighlightExpiring] = useState(false);
  const [pageMap, setPageMap] = useState<Map<string, number>>(new Map());
  const [openGradeGroups, setOpenGradeGroups] = useState<string[]>([]);
  const [accordionStateReady, setAccordionStateReady] = useState(false);
  const [accordionInitialized, setAccordionInitialized] = useState(false);
  const PAGE_SIZE = 4;
  const [openMenuExamId, setOpenMenuExamId] = useState<number | null>(null);
  const [viewMode, setViewMode] = useState<"admin" | "faculty">(() => {
    if (typeof window === "undefined") return "faculty";
    return localStorage.getItem("examViewMode") === "admin" ? "admin" : "faculty";
  });
  const storageKeys = useMemo(
    () => ({
      openGradeGroups: makeExamStorageKey(user?.id, viewMode, "open-grade-groups"),
      exams: makeExamStorageKey(user?.id, viewMode, "exams"),
      assignments: makeExamStorageKey(user?.id, viewMode, "assignments"),
      scroll: makeExamStorageKey(user?.id, viewMode, "scroll"),
    }),
    [user?.id, viewMode],
  );
  const fetchSectionIdsRef = useRef<number[] | undefined>(undefined);
  const gradeGroupRefs = useRef<Map<string, HTMLDivElement | null>>(new Map());
  const newExamScrollDoneRef = useRef(false);
  const restoredScrollDoneRef = useRef(false);

  // Handle ?newExamIds= short-lived highlight persisted in localStorage
  useEffect(() => {
    const HIGHLIGHT_MS = 10 * 1000;
    const FADE_BEFORE_MS = 4 * 1000;
    const STORAGE_KEY = "examHighlight";

    // If new exams were just created, record all IDs with an expiry timestamp
    const newIds = searchParams.get("newExamIds");
    if (newIds) {
      const examIds = newIds.split(",").map(Number).filter((n) => !isNaN(n));
      if (examIds.length > 0) {
        localStorage.setItem(
          STORAGE_KEY,
          JSON.stringify({ examIds, expiresAt: Date.now() + HIGHLIGHT_MS }),
        );
      }
      const url = new URL(window.location.href);
      url.searchParams.delete("newExamIds");
      window.history.replaceState({}, "", url.toString());
    }

    // Restore highlight from storage (covers page reload / navigation back)
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    try {
      const { examIds, expiresAt } = JSON.parse(raw) as {
        examIds: number[];
        expiresAt: number;
      };
      const remaining = expiresAt - Date.now();
      if (remaining <= 0) {
        localStorage.removeItem(STORAGE_KEY);
        return;
      }

      setNewlyCreatedExamIds(new Set(examIds));
      setHighlightExpiring(remaining <= FADE_BEFORE_MS);

      const fadeDelay = remaining - FADE_BEFORE_MS;
      const fadeTimer =
        fadeDelay > 0
          ? setTimeout(() => setHighlightExpiring(true), fadeDelay)
          : null;

      const clearTimer = setTimeout(() => {
        setNewlyCreatedExamIds(new Set());
        setHighlightExpiring(false);
        localStorage.removeItem(STORAGE_KEY);
      }, remaining);

      return () => {
        if (fadeTimer) clearTimeout(fadeTimer);
        clearTimeout(clearTimer);
      };
    } catch {
      localStorage.removeItem(STORAGE_KEY);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const hasFullAccess = permissions.includes("exams.full_access");
  const isAdministrator = roles.some((r) => r.name === "Administrator");

  // Allowed section/subject IDs for teachers with partial access (null = no filter)
  const [allowedSectionIds, setAllowedSectionIds] =
    useState<Set<number> | null>(null);
  const [assignedSectionSubjectPairs, setAssignedSectionSubjectPairs] =
    useState<Set<string>>(new Set());
  const [teacherAssignments, setTeacherAssignments] = useState<
    { section_id: number; curriculum_subject_id: number; subject_id: number }[]
  >([]);
  const [subjectCatalog] = useState<SubjectWithGradeLevel[]>(
    initialData?.subjects ?? [],
  );

  // Admin with teaching load can switch between views; others stay in their natural view.
  // effectiveFullAccess is false when an admin opts into Faculty View.
  const showViewToggle =
    isAdministrator &&
    allowedSectionIds !== null &&
    allowedSectionIds.size > 0 &&
    assignedSectionSubjectPairs.size > 0;
  const effectiveFullAccess = hasFullAccess && viewMode === "admin";

  // In admin view: no section/subject filter (see all). In faculty view: restrict to assigned.
  const effectiveAllowedSectionIds = effectiveFullAccess ? null : allowedSectionIds;

  const [allGradeLevels] = useState<GradeLevel[]>(initialData?.gradeLevels ?? []);
  const [allSections] = useState<Section[]>(initialData?.sections ?? []);
  const [hasActiveSchoolYear] = useState(initialData?.activeSyId != null);
  const [hasActiveTerm] = useState(initialData?.activeQuarterId != null);
	  const showViewToggleVisible = showViewToggle && hasActiveSchoolYear && hasActiveTerm;

	  const getVisibleAssignments = useCallback((exam: ExamWithRelations) => {
	    const assignments = exam.exam_assignments ?? [];
	    if (!effectiveAllowedSectionIds) return assignments;
	    return assignments.filter((a) => {
	      const sectionId = a.sections?.section_id;
	      if (sectionId == null) return false;
	      if (!effectiveAllowedSectionIds.has(sectionId)) return false;
	      const pair = `${sectionId}-${exam.curriculum_subject_id}`;
	      return assignedSectionSubjectPairs.has(pair);
	    });
	  }, [effectiveAllowedSectionIds, assignedSectionSubjectPairs]);

  const fetchExams = async (
    sectionIds?: number[],
    options: { forceRefresh?: boolean } = {},
  ) => {
    fetchSectionIdsRef.current = sectionIds;
    const scopeKey = makeExamScopeKey(sectionIds);
    const cached = options.forceRefresh
      ? { hasCache: false, exams: [] as ExamWithRelations[] }
      : readStoredExamList(storageKeys.exams, scopeKey);

    if (options.forceRefresh && storageKeys.exams && typeof window !== "undefined") {
      window.sessionStorage.removeItem(storageKeys.exams);
    }

    if (cached.hasCache) {
      setExams(cached.exams);
      setLoading(false);
    } else {
      setLoading(true);
    }
    setDbError(null);
    try {
      // Reuse the active term the server already resolved; if initialData failed
      // to load, pass undefined so the service self-resolves (original behavior).
      const data = await fetchExamsWithRelations(
        sectionIds,
        initialData
          ? { activeSyId: initialData.activeSyId, activeQuarterId: initialData.activeQuarterId }
          : undefined,
      );
      setExams(data);
      if (storageKeys.exams && typeof window !== "undefined") {
        window.sessionStorage.setItem(
          storageKeys.exams,
          JSON.stringify({ scopeKey, exams: data }),
        );
      }
      // Check which exams have at least one scanned student — needed for delete guard.
      // Wrapped in its own try so a failure here doesn't break the exam list.
      const allAssignmentIds = data.flatMap(e => (e.exam_assignments ?? []).map(a => a.id));
      try {
        if (allAssignmentIds.length > 0) {
          const scoresRes = await fetch('/api/exams/scores/exists', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ assignmentIds: allAssignmentIds }),
          });
          if (scoresRes.ok) {
            const { withScores } = await scoresRes.json() as { withScores: number[] };
            const withScoresSet = new Set(withScores);
            const assignmentToExam = new Map<number, number>();
            for (const exam of data) {
              for (const a of exam.exam_assignments ?? []) {
                assignmentToExam.set(a.id, exam.exam_id);
              }
            }
            setExamIdsWithScores(
              new Set(
                [...withScoresSet]
                  .map(aId => assignmentToExam.get(aId))
                  .filter((id): id is number => id != null),
              ),
            );
          } else {
            setExamIdsWithScores(new Set());
          }
        } else {
          setExamIdsWithScores(new Set());
        }
      } catch {
        setExamIdsWithScores(new Set());
      }
    } catch (error: unknown) {
      if (!cached.hasCache) setExams([]);
      setDbError(error instanceof Error ? error.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  };

  const refetchExams = () =>
    fetchExams(fetchSectionIdsRef.current, { forceRefresh: true });

  useEffect(() => {
    if (loading || !storageKeys.exams || typeof window === "undefined") return;
    window.sessionStorage.setItem(
      storageKeys.exams,
      JSON.stringify({ scopeKey: makeExamScopeKey(fetchSectionIdsRef.current), exams }),
    );
  }, [exams, loading, storageKeys.exams]);

  useEffect(() => {
    if (authLoading || fetchSectionIdsRef.current !== undefined) return;
    setLoading(true);
  }, [authLoading, storageKeys.exams]);

  useEffect(() => {
    if (authLoading) return;

    const isEffectiveFullAccess =
      permissions.includes("exams.full_access") && viewMode === "admin";

    setDbError(null);

    const init = async () => {
      if (user?.id) {
        const applyAssignments = (assignments: TeacherAssignmentCache[]) => {
          setTeacherAssignments(assignments);
          if (storageKeys.assignments && typeof window !== "undefined") {
            window.sessionStorage.setItem(storageKeys.assignments, JSON.stringify(assignments));
          }
          const sectionSet = new Set(assignments.map((a) => a.section_id));
          setAllowedSectionIds(sectionSet);
          setAssignedSectionSubjectPairs(
            new Set(
              assignments.map((a) => `${a.section_id}-${a.curriculum_subject_id}`),
            ),
          );
          const sectionIds = isEffectiveFullAccess
            ? undefined
            : Array.from(sectionSet);
          fetchExams(sectionIds);
        };

        const cachedAssignments = readStoredExamState(
          storageKeys.assignments,
          [],
          isTeacherAssignmentArray,
        );
        if (cachedAssignments.length > 0) {
          applyAssignments(cachedAssignments);
        }

        const assignments = await fetchTeacherClassAssignments();
        setTeacherAssignments(assignments);
        applyAssignments(assignments);
      } else {
        setTeacherAssignments([]);
        setAllowedSectionIds(null);
        setAssignedSectionSubjectPairs(new Set());
        fetchExams(isEffectiveFullAccess ? undefined : []);
      }
    };

    init();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading, user?.id, hasFullAccess, viewMode, storageKeys.assignments]);

  // Persist view mode so navigation away and back keeps the faculty view active.
  useEffect(() => {
    localStorage.setItem("examViewMode", viewMode);
  }, [viewMode]);

  // Restore accordion open/closed state for this browser session.
  useEffect(() => {
    if (!storageKeys.openGradeGroups) {
      setOpenGradeGroups([]);
      setAccordionStateReady(true);
      return;
    }
    setOpenGradeGroups(
      readStoredExamState(storageKeys.openGradeGroups, [], isStringArray),
    );
    setAccordionInitialized(false);
    setAccordionStateReady(true);
  }, [storageKeys.openGradeGroups]);

  // Reset to admin view if the user no longer has a teaching load (e.g. load removed mid-session).
  // Guard: allowedSectionIds === null means assignments haven't loaded yet — skip to avoid
  // prematurely resetting a faculty view that was restored from localStorage.
  useEffect(() => {
    if (allowedSectionIds === null) return;
    if (!showViewToggle && viewMode === "faculty") {
      setViewMode("admin");
      localStorage.setItem("examViewMode", "admin");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showViewToggle, allowedSectionIds]);

	  const gradeLevelOptions = useMemo(() => {
    if (effectiveFullAccess) {
      return allGradeLevels.map((gradeLevel) => ({
        value: gradeLevel.display_name,
        label: gradeLevel.display_name,
      }));
    }

    const assignedSectionIds = new Set(
      teacherAssignments.map((assignment) => assignment.section_id),
    );
    const assignedGradeLevelIds = new Set(
      allSections
        .filter((section) => assignedSectionIds.has(section.section_id))
        .map((section) => section.grade_level_id)
        .filter((gradeLevelId): gradeLevelId is number => gradeLevelId != null),
    );

    return allGradeLevels
      .filter((gradeLevel) => assignedGradeLevelIds.has(gradeLevel.grade_level_id))
      .map((gradeLevel) => gradeLevel.display_name)
      .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }))
      .map((name) => ({ value: name, label: name }));
	  }, [effectiveFullAccess, allGradeLevels, allSections, teacherAssignments]);

	  const sectionOptions = useMemo(() => {
    if (effectiveFullAccess) {
      const selectedGradeLevelId = allGradeLevels.find(
        (grade) => grade.display_name === selectedGradeLevel,
      )?.grade_level_id;

      return Array.from(
        new Set(
          allSections
            .filter(
              (section) =>
                !selectedGradeLevelId || section.grade_level_id === selectedGradeLevelId,
            )
            .map((section) => section.name),
        ),
      )
        .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }))
        .map((name) => ({ value: name, label: name }));
    }

    const assignedSectionIds = new Set(
      teacherAssignments.map((assignment) => assignment.section_id),
    );
    const selectedGradeLevelId = allGradeLevels.find(
      (grade) => grade.display_name === selectedGradeLevel,
    )?.grade_level_id;

    return Array.from(
      new Set(
        allSections
          .filter((section) => assignedSectionIds.has(section.section_id))
          .filter(
            (section) =>
              !selectedGradeLevelId ||
              section.grade_level_id === selectedGradeLevelId,
          )
          .map((section) => section.name),
      ),
    )
      .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }))
      .map((name) => ({ value: name, label: name }));
	  }, [
      effectiveFullAccess,
      allSections,
      allGradeLevels,
      selectedGradeLevel,
      teacherAssignments,
    ]);

  const canDeleteExam = (exam: ExamWithRelations): boolean => {
    if (!exam.curriculum_subject_id) return false;
    // Finalized exams (pushed to reports) can never be deleted — applies to all roles.
    if (exam.is_locked) return false;
    // Exams with any scanned student can never be deleted — applies to all roles.
    // null means the check hasn't resolved yet; treat as blocked until it does.
    if (examIdsWithScores === null || examIdsWithScores.has(exam.exam_id)) return false;
    if (effectiveFullAccess) return true;
    // Creator can always delete their own exam (covers copies assigned to SSES/cross-type sections)
    if (user?.id && exam.creator_teacher_id === user.id) return true;
    if (assignedSectionSubjectPairs.size === 0) return false;

    const assignmentPairs = new Set(
      (exam.exam_assignments ?? [])
        .map((a) => a.sections?.section_id)
        .filter(
          (sectionId): sectionId is number => typeof sectionId === "number",
        )
        .map((sectionId) => `${sectionId}-${exam.curriculum_subject_id}`),
    );

    for (const pair of assignmentPairs) {
      if (assignedSectionSubjectPairs.has(pair)) return true;
    }
    return false;
  };

  // sectionId → grade level display name (derived from exam assignments already loaded)
  const sectionGradeLevelMap = useMemo(() => {
    const map = new Map<number, string>();
    for (const exam of exams) {
      for (const a of exam.exam_assignments ?? []) {
        const sid = a.sections?.section_id;
        const gl = a.sections?.grade_levels?.display_name;
        if (sid != null && gl) map.set(sid, gl);
      }
    }
    return map;
  }, [exams]);

  // Exams where all faculty-handled sections of the same grade level already have this subject's exam.
  const blockedCopyExamIds = useMemo(() => {
    const teacherSectionIds = new Set(teacherAssignments.map(a => a.section_id));

    // Pre-build: subject+quarter → covered section IDs across all exams.
    const coveredMap = new Map<string, Set<number>>();
    for (const e of exams) {
      if (!e.quarter_id) continue;
      const key = `${e.curriculum_subject_id}-${e.quarter_id}`;
      if (!coveredMap.has(key)) coveredMap.set(key, new Set());
      for (const a of e.exam_assignments ?? []) {
        const sid = a.sections?.section_id;
        if (sid != null) coveredMap.get(key)!.add(sid);
      }
    }

    const blocked = new Set<number>();
    for (const exam of exams) {
      if (!exam.quarter_id) continue;

      // Determine grade level of this exam's sections via allSections.
      const firstSid = exam.exam_assignments?.[0]?.sections?.section_id;
      const gradeLevelId = firstSid != null
        ? allSections.find(s => s.section_id === firstSid)?.grade_level_id
        : null;
      if (!gradeLevelId) continue;

      // SSES-exclusive subjects only ever apply to SSES sections; regular sections
      // can never hold this exam, so they must not count toward "fully covered".
      const isSsesSubject =
        exam.curriculum_subjects?.subjects?.subject_type === "SSES";

      // Sections of the same grade level this faculty handles (all if admin).
      const relevantSections = allSections.filter(
        s => s.grade_level_id === gradeLevelId &&
          (!isSsesSubject || s.section_type === "SSES") &&
          (effectiveFullAccess || teacherSectionIds.has(s.section_id)),
      );
      if (relevantSections.length === 0) continue;

      const covered = coveredMap.get(`${exam.curriculum_subject_id}-${exam.quarter_id}`) ?? new Set();
      if (relevantSections.every(s => covered.has(s.section_id))) {
        blocked.add(exam.exam_id);
      }
    }
    return blocked;
  }, [exams, allSections, teacherAssignments, effectiveFullAccess]);

  // "sectionId-curriculumSubjectId-quarterId" already taken by an existing exam
  const occupiedCombinations = useMemo(() => {
    const set = new Set<string>();
    for (const exam of exams) {
      if (!exam.curriculum_subject_id || !exam.quarter_id) continue;
      for (const a of exam.exam_assignments ?? []) {
        const sid = a.sections?.section_id;
        if (sid != null) set.add(`${sid}-${exam.curriculum_subject_id}-${exam.quarter_id}`);
      }
    }
    return set;
  }, [exams]);


	  const subjectOptions = useMemo(() => {
    if (!effectiveFullAccess) {
      const selectedGradeLevelId = allGradeLevels.find(
        (grade) => grade.display_name === selectedGradeLevel,
      )?.grade_level_id;

      // If a section is selected, narrow subjects to only those the teacher is
      // assigned to teach in that specific section (mirrors Create Exam behaviour).
      if (selectedSection) {
        const selectedSectionId = allSections.find(
          (s) => s.name === selectedSection &&
            (!selectedGradeLevelId || s.grade_level_id === selectedGradeLevelId),
        )?.section_id;

        const sectionSubjectIds = new Set(
          teacherAssignments
            .filter((a) => a.section_id === selectedSectionId)
            .map((a) => a.curriculum_subject_id),
        );

        return Array.from(
          new Map(
            subjectCatalog
              .filter((subject) => sectionSubjectIds.has(subject.curriculum_subject_id))
              .map((subject) => [subject.name, subject] as const),
          ).values(),
        )
          .map((subject) => subject.name)
          .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));
      }

      // No section selected — show all subjects the teacher handles, optionally
      // filtered to the selected grade level.
      const assignedSubjectIds = new Set(
        teacherAssignments.map((assignment) => assignment.curriculum_subject_id),
      );

      return Array.from(
        new Map(
          subjectCatalog
            .filter((subject) =>
              assignedSubjectIds.has(subject.curriculum_subject_id),
            )
            .filter(
              (subject) =>
                !selectedGradeLevelId ||
                subject.grade_level_id === selectedGradeLevelId,
            )
            .map((subject) => [subject.name, subject] as const),
        ).values(),
      )
        .map((subject) => subject.name)
        .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));
    }

    const selectedGradeLevelId = allGradeLevels.find(
      (grade) => grade.display_name === selectedGradeLevel,
    )?.grade_level_id;
    const selectedSectionGradeLevelId = selectedSection
      ? allSections.find((section) => section.name === selectedSection)?.grade_level_id
      : null;
    const activeGradeLevelId = selectedSectionGradeLevelId ?? selectedGradeLevelId;

    return Array.from(
      new Map(
        subjectCatalog
          .filter(
            (subject) =>
              !activeGradeLevelId || subject.grade_level_id === activeGradeLevelId,
          )
          .map((subject) => [subject.name, subject] as const),
      ).values(),
    )
      .map((subject) => subject.name)
      .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));
	  }, [
      selectedGradeLevel,
      selectedSection,
      effectiveFullAccess,
      teacherAssignments,
      subjectCatalog,
      allGradeLevels,
      allSections,
    ]);

  const subjectFilterOptions = useMemo(
    () => [
      { value: "", label: "All Subjects" },
      ...subjectOptions.map((name) => ({ value: name, label: name })),
    ],
    [subjectOptions],
  );

  const totalTeacherSections = useMemo(() => {
    if (effectiveFullAccess) return Infinity;
    const assignedSectionIds = new Set(teacherAssignments.map((a) => a.section_id));
    return Array.from(
      new Set(allSections.filter((s) => assignedSectionIds.has(s.section_id)).map((s) => s.name))
    ).length;
  }, [effectiveFullAccess, teacherAssignments, allSections]);

  const totalTeacherSubjects = useMemo(() => {
    if (effectiveFullAccess) return Infinity;
    const assignedSubjectIds = new Set(teacherAssignments.map((a) => a.curriculum_subject_id));
    return Array.from(
      new Map(
        subjectCatalog
          .filter((s) => assignedSubjectIds.has(s.curriculum_subject_id))
          .map((s) => [s.name, s] as const)
      ).values()
    ).length;
  }, [effectiveFullAccess, teacherAssignments, subjectCatalog]);

  const showGradeLevelFilter = effectiveFullAccess || gradeLevelOptions.length > 1;
  const showSectionFilter = effectiveFullAccess || totalTeacherSections > 1;
  const showSubjectFilter = effectiveFullAccess || totalTeacherSubjects > 1;

  useEffect(() => {
    setSelectedSection("");
    setSelectedSubject("");
  }, [selectedGradeLevel]);

  useEffect(() => {
    setSelectedSubject("");
  }, [selectedSection]);

  useEffect(() => {
    let filtered = [...exams];
    if (searchQuery) {
      filtered = filtered.filter((e) =>
        e.title.toLowerCase().includes(searchQuery.toLowerCase()),
      );
    }
	    if (selectedGradeLevel) {
	      filtered = filtered.filter((e) =>
	        getVisibleAssignments(e).some(
	          (a) => a.sections?.grade_levels?.display_name === selectedGradeLevel,
	        ),
	      );
	    }
	    if (selectedSection) {
	      filtered = filtered.filter((e) =>
	        getVisibleAssignments(e).some(
	          (a) => a.sections?.name === selectedSection,
	        ),
	      );
    }
    if (selectedSubject) {
      filtered = filtered.filter(
        (e) => e.curriculum_subjects?.subjects?.name === selectedSubject,
      );
    }
	    setFilteredExams(filtered);
	  }, [
	    exams,
	    searchQuery,
	    selectedGradeLevel,
	    selectedSection,
	    selectedSubject,
	    getVisibleAssignments,
	  ]);

  const isFiltering = !!(searchQuery || selectedGradeLevel || selectedSection || selectedSubject);

  const facultyVisibleGradeGroups = useMemo(() => {
    if (effectiveFullAccess || !effectiveAllowedSectionIds) return [];

    const allowedGradeIds = new Set(
      allSections
        .filter((section) => effectiveAllowedSectionIds.has(section.section_id))
        .map((section) => section.grade_level_id)
        .filter((gradeLevelId): gradeLevelId is number => gradeLevelId != null),
    );

    return allGradeLevels
      .filter((gradeLevel) => allowedGradeIds.has(gradeLevel.grade_level_id))
      .map((gradeLevel) => ({
        gradeLabel: gradeLevel.display_name,
        levelNumber: gradeLevel.level_number,
      }));
  }, [effectiveFullAccess, effectiveAllowedSectionIds, allSections, allGradeLevels]);

	  const groupedExams = useMemo(() => {
	    const groups = new Map<string, { gradeLabel: string; levelNumber: number; exams: ExamWithRelations[] }>();
	
	    // Admin view can show all grade groups; restricted views only show handled groups.
	    if (effectiveFullAccess) {
	      for (const gl of allGradeLevels) {
	        groups.set(gl.display_name, { gradeLabel: gl.display_name, levelNumber: gl.level_number, exams: [] });
	      }
	    } else {
	      for (const group of facultyVisibleGradeGroups) {
	        groups.set(group.gradeLabel, { gradeLabel: group.gradeLabel, levelNumber: group.levelNumber, exams: [] });
	      }
	    }
	
	    for (const exam of filteredExams) {
	      const visibleAssignments = getVisibleAssignments(exam);
	      if (!effectiveFullAccess && visibleAssignments.length === 0) continue;
	      const gl = visibleAssignments[0]?.sections?.grade_levels;
	      const key = gl?.display_name ?? "Unknown";
	      if (!groups.has(key)) {
	        groups.set(key, { gradeLabel: key, levelNumber: Infinity, exams: [] });
      }
      groups.get(key)!.exams.push(exam);
    }

    return Array.from(groups.values())
      .map((group) => ({
        ...group,
        exams: [...group.exams].sort(
          (a, b) => Number(a.is_locked) - Number(b.is_locked),
        ),
      }))
      .sort((a, b) => a.levelNumber - b.levelNumber);
	  }, [filteredExams, allGradeLevels, facultyVisibleGradeGroups, isFiltering, effectiveFullAccess, getVisibleAssignments]);

  // Faculty with assigned classes always have (possibly empty) grade-level groups,
  // so `groupedExams.length` is never 0 for them. Trigger the prominent empty state
  // on the actual exam count instead, scoped to faculty (admins keep empty accordions).
  const hasAnyExams = useMemo(
    () => groupedExams.some((group) => group.exams.length > 0),
    [groupedExams],
  );
  const showCreateEmptyState = !isFiltering && !hasAnyExams && !effectiveFullAccess;

  // Initialize once: open all visible groups if there is no restored state.
  // Wait for groupedExams to populate — exams load async, so firing before data
  // arrives would set an empty list and lock it in via accordionInitialized.
  useEffect(() => {
    if (!accordionStateReady || accordionInitialized) return;
    if (groupedExams.length === 0) return;
    if (openGradeGroups.length > 0) {
      setAccordionInitialized(true);
      return;
    }
    setOpenGradeGroups(groupedExams.map((group) => group.gradeLabel));
    setAccordionInitialized(true);
  }, [accordionStateReady, accordionInitialized, openGradeGroups.length, groupedExams]);

  // When newly created exams arrive, open their grade level accordion groups.
  useEffect(() => {
    if (newlyCreatedExamIds.size === 0 || groupedExams.length === 0) return;
    const groupsToOpen = groupedExams
      .filter((group) => group.exams.some((exam) => newlyCreatedExamIds.has(exam.exam_id)))
      .map((group) => group.gradeLabel);
    if (groupsToOpen.length === 0) return;
    setOpenGradeGroups((prev) => {
      const merged = Array.from(new Set([...prev, ...groupsToOpen]));
      if (storageKeys.openGradeGroups && typeof window !== 'undefined') {
        sessionStorage.setItem(storageKeys.openGradeGroups, JSON.stringify(merged));
      }
      return merged;
    });
  }, [newlyCreatedExamIds, groupedExams, storageKeys.openGradeGroups]);

  useEffect(() => {
    if (newlyCreatedExamIds.size === 0) {
      newExamScrollDoneRef.current = false;
      return;
    }
    if (newExamScrollDoneRef.current || groupedExams.length === 0) return;

    const targetGroup = groupedExams.find((group) =>
      group.exams.some((exam) => newlyCreatedExamIds.has(exam.exam_id)),
    );
    if (!targetGroup) return;

    const targetNode = gradeGroupRefs.current.get(targetGroup.gradeLabel);
    if (!targetNode) return;

    newExamScrollDoneRef.current = true;
    targetNode.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [newlyCreatedExamIds, groupedExams]);

  const handleAccordionChange = (value: string[]) => {
    setOpenGradeGroups(value);
    if (storageKeys.openGradeGroups && typeof window !== "undefined") {
      sessionStorage.setItem(storageKeys.openGradeGroups, JSON.stringify(value));
    }
  };

  const openExamRoute = useCallback(
    (href: string) => {
      saveExamScrollPosition(storageKeys.scroll);
      restoredScrollDoneRef.current = false;
      router.push(href);
    },
    [router, storageKeys.scroll],
  );

  useEffect(() => {
    restoredScrollDoneRef.current = false;
  }, [storageKeys.scroll]);

  useEffect(() => {
    if (
      restoredScrollDoneRef.current ||
      loading ||
      !accordionStateReady ||
      !accordionInitialized
    ) {
      return;
    }
    restoredScrollDoneRef.current = true;
    restoreExamScrollPosition(storageKeys.scroll);
  }, [
    accordionInitialized,
    accordionStateReady,
    loading,
    storageKeys.scroll,
    groupedExams,
  ]);

  const handleStatusChange = async (
    exam: ExamWithRelations,
    newStatus: "active" | "inactive",
  ) => {
    setUpdatingStatus(exam.exam_id);
    const isLocked = newStatus === "inactive";
    const success = await setExamLocked(exam.exam_id, isLocked);
    if (success) {
      setExams((prev) =>
        prev.map((e) =>
          e.exam_id === exam.exam_id ? { ...e, is_locked: isLocked } : e,
        ),
      );
      notify({
        type: "success",
        title: "Status updated",
        message: `Exam is now ${newStatus}`,
      });
    } else {
      notify({
        type: "error",
        title: "Status update failed",
        message: "Could not save exam status. Check permissions and try again.",
      });
      await refetchExams();
    }
    setUpdatingStatus(null);
  };

  const handleDownloadAnswerSheet = async (exam: ExamWithRelations) => {
    const sectionNames = (exam.exam_assignments ?? [])
      .map((a) => a.sections?.name)
      .filter(Boolean)
      .join(", ");
    const generatedBy =
      `${firstName ?? ""} ${lastName ?? ""}`.trim() ||
      user?.email ||
      "Unknown User";
    // answer_key is omitted from the list payload — fetch it on demand so the
    // sheet uses the exam's real num_choices (resolveExamParams falls back to a
    // 4-choice default if this is missing).
    const grading = await fetchExamGradingData(exam.exam_id);
    const pdf = await generateAnswerSheetPdf({
      exam: grading ? { ...exam, answer_key: grading.answer_key } : exam,
      sectionName: sectionNames,
      generatedBy,
    });
    pdf.save(`${exam.title}_AnswerSheet.pdf`);
    notify({
      type: "info",
      title: "Downloaded",
      message: "Answer sheet saved to downloads",
    });
  };

  const handleOpenDeleteModal = (exam: ExamWithRelations) => {
    setExamToDelete(exam);
    setConfirmText("");
    setDeleteOpened(true);
  };

  const handleCloseDeleteModal = () => {
    if (deleting) return;
    setDeleteOpened(false);
    setExamToDelete(null);
    setConfirmText("");
  };

  const handleDeleteExam = async () => {
    if (!examToDelete) return;
    setDeleting(true);
    const success = await deleteExamWithAssignments(examToDelete.exam_id);
    if (success) {
      notify({
        type: "success",
        title: "Examination Deleted",
        message: `${examToDelete.title} has been deleted successfully.`,
      });
      handleCloseDeleteModal();
      await refetchExams();
    } else {
      notify({
        type: "error",
        title: "Delete Failed",
        message: "Unable to delete examination. Please try again.",
      });
    }
    setDeleting(false);
  };

  const viewToggleButton =
    showViewToggleVisible ? (
      <SegmentedControl
        value={viewMode}
        onChange={(value) => setViewMode(value as "admin" | "faculty")}
        data={[
          { value: "admin", label: "Admin View" },
          { value: "faculty", label: "Faculty View" },
        ]}
        color={viewMode === "admin" ? "#4A72AE" : "#4EAE4A"}
        radius="sm"
        size="sm"
        transitionDuration={180}
        fullWidth={isMobile}
        disabled={loading || authLoading}
        styles={{
          root: {
            backgroundColor: "#ffffff",
            border: "1px solid #D6D9E0",
            padding: 3,
            minWidth: 230,
          },
          label: {
            fontWeight: 600,
            fontSize: 14,
            padding: "6px 14px",
            whiteSpace: "nowrap",
          },
          indicator: {
            border: `1px solid ${viewMode === "admin" ? "#4A72AE" : "#4EAE4A"}`,
          },
        }}
      />
    ) : null;

  const createExamButton =
    (loading || (hasActiveSchoolYear && hasActiveTerm)) &&
    !effectiveFullAccess ? (
      <Stack gap={4} align="flex-end">
        <Tooltip
          label="You need to be assigned to at least one class before you can create exams."
          disabled={
            isMobile ||
            effectiveFullAccess ||
            !effectiveAllowedSectionIds ||
            effectiveAllowedSectionIds.size > 0
          }
          withArrow
          multiline
          w={240}
        >
          <span>
            <Button
              color="#4EAE4A"
              radius="md"
              onClick={() => openExamRoute("/exam/create")}
              disabled={
                !effectiveFullAccess &&
                !!effectiveAllowedSectionIds &&
                effectiveAllowedSectionIds.size === 0
              }
            >
              Create Exam
            </Button>
          </span>
        </Tooltip>
        {isMobile &&
          !effectiveFullAccess &&
          !!effectiveAllowedSectionIds &&
          effectiveAllowedSectionIds.size === 0 && (
            <Text size="xs" c="red" ta="right" maw={160}>
              You need a class assignment to create exams.
            </Text>
          )}
      </Stack>
    ) : null;

  return (
    <>
      {isMobile ? (
        <>
          <Group justify="space-between" align="center" mb="xs" wrap="nowrap">
            <h1 className="text-2xl font-bold text-[#597D37] mb-0 leading-tight">
              Examinations{" "}
              {!loading && hasActiveSchoolYear && hasActiveTerm && (
                <span className="text-[#808898] text-xl font-semibold">({filteredExams.length})</span>
              )}
            </h1>
            {createExamButton}
          </Group>
          <p className="mb-3 text-sm text-[#808898]">
            Manage and track all examinations
          </p>
          {viewToggleButton && <Box mb="md">{viewToggleButton}</Box>}
        </>
      ) : (
        <Box className="relative mb-3">
          <div className="pr-60">
            <h1 className="text-2xl md:text-3xl font-bold text-[#597D37] mb-3">
              Examinations{" "}
              {!loading && hasActiveSchoolYear && hasActiveTerm && (
                <span className="text-[#808898] text-xl font-semibold">({filteredExams.length})</span>
              )}
            </h1>
            <p className="text-sm text-[#808898]">
              Manage and track all examinations
            </p>
          </div>
          <Stack gap="md" align="flex-end" className="absolute right-0 top-0">
            {viewToggleButton}
            {createExamButton}
          </Stack>
        </Box>
      )}

      {/* Error */}
      {dbError && (
        <Alert
          icon={<IconAlertCircle size={16} />}
          title="Database Error"
          color="red"
        >
          {dbError}
          <Button
            size="xs"
            variant="light"
            color="red"
            mt="sm"
            onClick={refetchExams}
          >
            <IconRefreshDot size={14} /> Retry
          </Button>
        </Alert>
      )}

      {!loading && !dbError && (!hasActiveSchoolYear || !hasActiveTerm) ? (
        <NoActivePeriodBanner />
      ) : (
        <>
      {/* Filters */}
        <div>
        <Group mb="md" wrap="nowrap" align="flex-end" gap="sm">
          <SearchBar
            id="search-exams"
            placeholder="Search examinations..."
            ariaLabel="Search examinations"
            style={{ flex: "1 1 260px", minWidth: 0 }}
            maw={700}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.currentTarget.value)}
          />
          <Tooltip label="Refresh" position="bottom" withArrow disabled={!!isMobile}>
            <ActionIcon
              variant="outline"
              color="#808898"
              size="lg"
              radius="xl"
              onClick={refetchExams}
              loading={loading}
              aria-label="Refresh examinations"
            >
              <IconRefresh size={18} stroke={1.5} />
            </ActionIcon>
          </Tooltip>
        </Group>
	        <Group mb="md" gap="sm" wrap="wrap">
          {showGradeLevelFilter && (
            <Select
              data={[{ value: "", label: "All Grade Levels" }, ...gradeLevelOptions]}
              value={selectedGradeLevel}
              onChange={(v) => setSelectedGradeLevel(v ?? "")}
              leftSection={<IconSchool size={16} />}
              clearable
              w={{ base: "100%", sm: 200 }}
              disabled={loading}
            />
          )}
          {showSectionFilter && (
            <Select
              data={[{ value: "", label: "All Sections" }, ...sectionOptions]}
              value={selectedSection}
              onChange={(v) => setSelectedSection(v ?? "")}
              leftSection={<IconUsers size={16} />}
              clearable
              w={{ base: "100%", sm: 200 }}
              disabled={loading || sectionOptions.length === 0}
            />
          )}
          {showSubjectFilter && (
            <Select
              data={subjectFilterOptions}
              value={selectedSubject}
              onChange={(v) => setSelectedSubject(v ?? "")}
              leftSection={<IconBook size={16} />}
              clearable
              w={{ base: "100%", sm: 200 }}
              disabled={loading}
              nothingFoundMessage="No subjects available for current filters"
            />
          )}
        </Group>
      </div>

      {/* Content */}
      {loading ? (
        <Stack gap="md">
          {[
            { widthLabel: 72, cards: 4 },
            { widthLabel: 56, cards: 2 },
          ].map((group, gi) => (
            <Box
              key={gi}
              style={{
                border: "1px solid #e5e7eb",
                borderRadius: 8,
                overflow: "hidden",
              }}
            >
              <Box
                px="md"
                py="sm"
                style={{ backgroundColor: "#f3f4f6" }}
              >
                <Group gap="xs">
                  <Skeleton height={18} width={group.widthLabel} radius="sm" />
                  <Skeleton height={14} width={28} radius="sm" />
                </Group>
              </Box>
              <Box p="sm">
                <SimpleGrid
                  cols={{ base: 1, sm: 2, md: 3, xl: 4 }}
                  spacing="sm"
                >
                  {Array.from({ length: group.cards }).map((_, i) => (
                    <Skeleton key={i} height={170} radius="md" />
                  ))}
                </SimpleGrid>
              </Box>
            </Box>
          ))}
        </Stack>
      ) : dbError ? null : isFiltering && filteredExams.length === 0 ? (
        <EmptySearchState />
      ) : showCreateEmptyState ? (
        <Center
          py={36}
          px="md"
          style={{
            border: "1px solid var(--mantine-color-gray-3)",
            borderRadius: "8px",
            backgroundColor: "#FFFFFF",
          }}
        >
          <Stack gap={10} align="center">
            <ThemeIcon size={48} radius="xl" color="gray.2" variant="filled" mb="sm">
              <IconClipboardOff size={28} stroke={1.5} color="#3D4147" />
            </ThemeIcon>
            <Stack gap={4} align="center">
              <Text size="sm" fw={500} c="#111827">
                No examinations yet.
              </Text>
              <Text size="sm" c="dimmed" ta="center">
                Create an examination to get started.
              </Text>
            </Stack>
            {!effectiveFullAccess && (
              <Button
                color="#4EAE4A"
                radius="md"
                size="sm"
                onClick={() => openExamRoute("/exam/create")}
              >
                Create Exam
              </Button>
            )}
          </Stack>
        </Center>
      ) : (
        <Accordion
          multiple
          value={openGradeGroups}
          onChange={handleAccordionChange}
          variant="separated"
          styles={{
            control: { backgroundColor: effectiveFullAccess ? "#e2edff" : "#f0f7ee" },
            item: { border: effectiveFullAccess ? "1px solid #e2edff" : "1px solid #d3e9d0" },
          }}
        >
          {groupedExams.map((group) => (
            <Accordion.Item
              key={group.gradeLabel}
              value={group.gradeLabel}
              ref={(node) => {
                gradeGroupRefs.current.set(group.gradeLabel, node);
              }}
            >
              <Accordion.Control>
                <Group gap="xs">
                  <Text fw={700} size="md">
                    {group.gradeLabel}
                  </Text>
                  <Text span size="sm" c="dimmed" fw={500}>
                    ({group.exams.length})
                  </Text>
                </Group>
              </Accordion.Control>
              <Accordion.Panel>
	                <SimpleGrid cols={{ base: 1, sm: 2, md: 3, xl: 4 }} p={{ base: 0, sm: "xs" }} spacing={{ base: "sm", sm: "md" }}>
                  {group.exams
                    .slice(
                      ((pageMap.get(group.gradeLabel) ?? 1) - 1) * PAGE_SIZE,
                      (pageMap.get(group.gradeLabel) ?? 1) * PAGE_SIZE,
                    )
                    .map((exam) => {
                      const subjectName =
                        exam.curriculum_subjects?.subjects?.name ?? "";
                      const creatorName = exam.creator_user
                        ? `${exam.creator_user.first_name ?? ""} ${exam.creator_user.last_name ?? ""}`.trim()
                        : "";
                      const sectionNames = getVisibleAssignments(exam)
                        .map((a) => a.sections?.name)
                        .filter(Boolean)
                        .join(", ");
                      const isNew = newlyCreatedExamIds.has(exam.exam_id);
                      return (
                        <Card
                          key={exam.exam_id}
                          shadow="sm"
                          padding="lg"
                          radius="md"
                          withBorder
                          onClick={() => openExamRoute(`/exam/${exam.exam_id}/scan`)}
                          style={{
                            transition:
                              "box-shadow 1.2s ease, border-color 1.2s ease",
                            boxShadow:
                              isNew && !highlightExpiring
                                ? "0 0 0 3px #4EAE4A, 0 8px 24px rgba(70,109,29,0.25)"
                                : undefined,
                            borderColor:
                              isNew && !highlightExpiring
                                ? "#4EAE4A"
                                : undefined,
                            display: "flex",
                            flexDirection: "column",
                            height: "100%",
                            cursor: "pointer",
                          }}
                        >
	                          <Group justify="space-between" mt="md" mb="xs" align="flex-start" wrap="nowrap">
                            <Text
                              fw={550}
                              size="lg"
                              lineClamp={2}
	                              style={{ flex: 1, minWidth: 0 }}
                            >
                              {exam.title}
                            </Text>
                            <Group
                              gap={4}
                              style={{ flexShrink: 0 }}
                              onClick={(e) => e.stopPropagation()}
                            >
                              <Badge
                                color={exam.is_locked ? "red" : "green"}
                                variant="light"
                              >
                                {exam.is_locked ? "Closed" : "Open"}
                              </Badge>
                              {!effectiveFullAccess && <Menu
                                shadow="md"
                                width={230}
                                position="bottom-end"
                                withinPortal
                                opened={openMenuExamId === exam.exam_id}
                                onChange={(o) =>
                                  setOpenMenuExamId(o ? exam.exam_id : null)
                                }
                              >
                                <Menu.Target>
                                  <ActionIcon
                                    variant="subtle"
                                    color="gray"
                                    radius="xl"
                                    aria-label="Exam actions"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setOpenMenuExamId(
                                        openMenuExamId === exam.exam_id
                                          ? null
                                          : exam.exam_id,
                                      );
                                    }}
                                  >
                                    <IconSettings size={15} />
                                  </ActionIcon>
                                </Menu.Target>
                                <Menu.Dropdown>
                                  {effectiveFullAccess && (
                                    <>
                                      <Menu.Label>Status</Menu.Label>
                                      <Menu.Item
                                        leftSection={
                                          <IconRefreshDot size={14} />
                                        }
                                        disabled={
                                          updatingStatus === exam.exam_id
                                        }
                                        onClick={() =>
                                          handleStatusChange(
                                            exam,
                                            exam.is_locked
                                              ? "active"
                                              : "inactive",
                                          )
                                        }
                                      >
                                        {exam.is_locked
                                          ? "Set Open"
                                          : "Set Closed"}
                                      </Menu.Item>
                                      <Menu.Divider />
                                    </>
                                  )}
                                  <Menu.Label>Actions</Menu.Label>
                                  <Menu.Item
                                    leftSection={<IconDownload size={14} />}
                                    onClick={() =>
                                      handleDownloadAnswerSheet(exam)
                                    }
                                  >
                                    Download Answer Sheet
                                  </Menu.Item>
                                  <Menu.Item
                                    leftSection={<IconBinoculars size={14} />}
                                    onClick={() => {
                                      setSelectedExam(exam);
                                      setIsViewDetailsOpen(true);
                                    }}
                                  >
                                    View Exam Details
                                  </Menu.Item>
                                  <Tooltip
                                    label="All sections already have an exam for this subject"
                                    disabled={!blockedCopyExamIds.has(exam.exam_id)}
                                    withArrow
                                    position="left"
                                  >
                                    <span style={{ display: 'block' }}>
                                      <Menu.Item
                                        leftSection={<IconCopy size={14} />}
                                        disabled={blockedCopyExamIds.has(exam.exam_id)}
                                        onClick={() => {
                                          setSelectedExam(exam);
                                          setIsCopyExamOpen(true);
                                        }}
                                      >
                                        Copy Exam
                                      </Menu.Item>
                                    </span>
                                  </Tooltip>
                                  {canDeleteExam(exam) && (
                                    <>
                                      <Menu.Divider />
                                      <Menu.Item
                                        leftSection={<IconTrash size={14} />}
                                        color="red"
                                        onClick={() =>
                                          handleOpenDeleteModal(exam)
                                        }
                                      >
                                        Delete
                                      </Menu.Item>
                                    </>
                                  )}
                                </Menu.Dropdown>
                              </Menu>}
                            </Group>
                          </Group>

                          <Divider my="sm" mb="lg" />

                          <Text c="#969696" fw={550} mb="sm">
                            About
                          </Text>
                          {subjectName && (
                            <Group mb="xs" gap="xs">
                              <IconBook size={16} color="gray" />
                              <Text size="sm">{subjectName}</Text>
                            </Group>
                          )}
                          {sectionNames && (
                            <Group mb="xs" gap="xs">
                              <IconUsers size={16} color="gray" />
                              <Text size="sm">{sectionNames}</Text>
                            </Group>
                          )}
                          {effectiveFullAccess && (
                            <Group mb="xs" gap="xs">
                              <IconUser size={16} color="gray" />
                              <Text size="sm">
                                {creatorName || "Unknown Teacher"}
                              </Text>
                            </Group>
                          )}
                        </Card>
                      );
                    })}
                </SimpleGrid>
                {group.exams.length > PAGE_SIZE && (
                  <Group justify="center" mt="sm">
                    <Pagination
                      total={Math.ceil(group.exams.length / PAGE_SIZE)}
                      value={pageMap.get(group.gradeLabel) ?? 1}
                      onChange={(page) =>
                        setPageMap((prev) =>
                          new Map(prev).set(group.gradeLabel, page),
                        )
                      }
                      size="sm"
                      color={effectiveFullAccess ? undefined : "#4EAE4A"}
                    />
                  </Group>
                )}
                {group.exams.length === 0 && (
                  <EmptySearchState
                    title="No examinations yet."
                    description="No examinations have been created for this grade level."
                  />
                )}
              </Accordion.Panel>
            </Accordion.Item>
          ))}
        </Accordion>
      )}
        </>
      )}

      <ViewExamDetailsModal
        exam={selectedExam}
        opened={isViewDetailsOpen}
        onClose={() => {
          setIsViewDetailsOpen(false);
          setSelectedExam(null);
        }}
      />

      <CopyExamModal
        exam={selectedExam}
        opened={isCopyExamOpen}
        onClose={() => {
          setIsCopyExamOpen(false);
          setSelectedExam(null);
        }}
        onCopied={(examIds) => {
          void refetchExams();
          const HIGHLIGHT_MS = 10_000;
          const FADE_BEFORE_MS = 4_000;
          setNewlyCreatedExamIds(new Set(examIds));
          setHighlightExpiring(false);
          setTimeout(() => setHighlightExpiring(true), HIGHLIGHT_MS - FADE_BEFORE_MS);
          setTimeout(() => {
            setNewlyCreatedExamIds(new Set());
            setHighlightExpiring(false);
          }, HIGHLIGHT_MS);
        }}
      />

      <Modal
        opened={deleteOpened}
        onClose={handleCloseDeleteModal}
        title="Delete Examination"
        centered
        closeOnClickOutside={!deleting}
        closeOnEscape={!deleting}
        withCloseButton={!deleting}
        overlayProps={{ backgroundOpacity: 0.5, blur: 4 }}
      >
        <Text size="sm" mb="md">
          Are you sure you want to delete{" "}
          <Text span fw={700}>
            {examToDelete?.title ?? "this examination"}
          </Text>
          ? This action cannot be undone.
        </Text>
        <Text size="sm" mb="md" c="dimmed">
          Type{" "}
          <Text span fw={700} c="var(--mantine-color-text)">
            delete
          </Text>{" "}
          to confirm.
        </Text>
        <TextInput
          placeholder="Type delete to confirm"
          value={confirmText}
          onChange={(e) => setConfirmText(e.currentTarget.value)}
          onKeyDown={(e) => {
            if (
              e.key === "Enter" &&
              confirmText.toLowerCase() === "delete" &&
              !deleting
            )
              handleDeleteExam();
          }}
          mb="lg"
          disabled={deleting}
        />
        <Group justify="flex-end" wrap="wrap">
          <Button
            variant="default"
            onClick={handleCloseDeleteModal}
            disabled={deleting}
            fullWidth={false}
          >
            Cancel
          </Button>
          <Button
            color="red"
            disabled={confirmText.toLowerCase() !== "delete"}
            loading={deleting}
            onClick={handleDeleteExam}
            fullWidth={false}
          >
            Delete
          </Button>
        </Group>
      </Modal>

    </>
  );
}
