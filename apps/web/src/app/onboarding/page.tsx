"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft, ArrowRight, Check, CheckCircle2, FileUp, Loader2, Plus, Save, Sparkles,
  TriangleAlert, UploadCloud, X,
} from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Logo } from "@/components/logo";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { Alert, Progress } from "@/components/ui/misc";
import { useAuth, useTheme } from "@/components/providers";
import { useToast } from "@/components/ui/toast";
import { api, ApiError } from "@/lib/api";
import { CheckGrid, RepeatableCard, TagsInput } from "@/components/onboarding/fields";
import type { OnboardingStatus, Preferences, WritingStyle } from "@/lib/types";
import { cn } from "@/lib/utils";

/* -------------------------------------------------------------------------- types */

type ExperienceDraft = {
  employer: string; title: string; employment_type: string; location: string;
  is_remote: boolean; start_date: string; end_date: string; is_current: boolean;
  description: string; achievements: string[]; tools: string[]; verified: boolean;
  provenance: string;
};
type EducationDraft = {
  institution: string; qualification: string; field_of_study: string; location: string;
  start_date: string; end_date: string; status: string; coursework: string;
  achievements: string[]; verified: boolean; provenance: string;
};
type SkillDraft = {
  name: string; category: string; proficiency: string; years_experience: string;
  evidence: string; verified: boolean; provenance: string;
};
type ProjectDraft = {
  name: string; description: string; technologies: string[]; repo_url: string;
  demo_url: string; outcomes: string; verified: boolean; provenance: string;
};
type CertificationDraft = {
  name: string; issuer: string; issue_date: string; credential_url: string;
  notes: string; verified: boolean; provenance: string;
};
type AchievementDraft = {
  title: string; category: string; description: string; date: string;
  evidence_url: string; verified: boolean; provenance: string;
};
type ImportedProfile = {
  preferred_name?: string; professional_headline?: string; summary?: string;
  email?: string; phone?: string; github_url?: string; linkedin_url?: string;
  portfolio_url?: string;
};
type CvImportResult = {
  upload_id: string;
  filename: string;
  extracted: {
    profile?: ImportedProfile;
    experiences?: Partial<ExperienceDraft>[];
    education?: Partial<EducationDraft>[];
    skills?: Partial<SkillDraft>[];
    projects?: Partial<ProjectDraft>[];
    certifications?: Partial<CertificationDraft>[];
    achievements?: Partial<AchievementDraft>[];
    warnings?: string[];
    suggestions?: string[];
    confidence?: number;
    requires_review?: boolean;
  };
  warnings: string[];
  suggestions: string[];
  message: string;
  can_apply: boolean;
};

type Draft = {
  objectives: string[];
  profile: {
    preferred_name: string; professional_headline: string; summary: string;
    phone: string; city: string; country: string;
  };
  experiences: ExperienceDraft[];
  education: EducationDraft[];
  skills: SkillDraft[];
  projects: ProjectDraft[];
  certifications: CertificationDraft[];
  achievements: AchievementDraft[];
  preferences: Preferences;
  writing_style: WritingStyle;
  cv_import: { upload_id?: string; filename?: string };
  confirmations: { accuracy: boolean; unverified: boolean; consent: boolean };
};

const EMPTY_EXPERIENCE: ExperienceDraft = {
  employer: "", title: "", employment_type: "full_time", location: "", is_remote: false,
  start_date: "", end_date: "", is_current: false, description: "", achievements: [],
  tools: [], verified: true, provenance: "user_confirmed",
};
const EMPTY_EDUCATION: EducationDraft = {
  institution: "", qualification: "", field_of_study: "", location: "", start_date: "",
  end_date: "", status: "completed", coursework: "", achievements: [], verified: true,
  provenance: "user_confirmed",
};
const EMPTY_SKILL: SkillDraft = {
  name: "", category: "General", proficiency: "intermediate", years_experience: "",
  evidence: "", verified: true, provenance: "user_confirmed",
};
const EMPTY_PROJECT: ProjectDraft = {
  name: "", description: "", technologies: [], repo_url: "", demo_url: "", outcomes: "",
  verified: true, provenance: "user_confirmed",
};
const EMPTY_CERTIFICATION: CertificationDraft = {
  name: "", issuer: "", issue_date: "", credential_url: "", notes: "", verified: true,
  provenance: "user_confirmed",
};
const EMPTY_ACHIEVEMENT: AchievementDraft = {
  title: "", category: "professional", description: "", date: "", evidence_url: "",
  verified: true, provenance: "user_confirmed",
};

const EMPTY_PREFERENCES: Preferences = {
  desired_titles: [], industries: [], countries: [], work_arrangements: [],
  employment_types: [], experience_level: "", salary_min: null, salary_max: null,
  currency: "USD", salary_period: "annual", relocation: "maybe",
  preferred_technologies: [], work_authorization: "", visa_required: null, notes: "",
};

const EMPTY_WRITING: WritingStyle = {
  tone: "professional", length_preference: "balanced", confidence: "confident",
  technicality: "technical", directness: "direct", cv_style: "ats",
  cover_letter_length: "standard", avoid_words: [], writing_samples: "",
  sample_permission: false,
};

const EMPTY_DRAFT: Draft = {
  objectives: [], profile: {
    preferred_name: "", professional_headline: "", summary: "", phone: "", city: "", country: "",
  },
  experiences: [], education: [], skills: [], projects: [], certifications: [],
  achievements: [], preferences: EMPTY_PREFERENCES, writing_style: EMPTY_WRITING,
  cv_import: {},
  confirmations: { accuracy: false, unverified: false, consent: false },
};

const OBJECTIVES = [
  { key: "full_time", label: "Find a full-time role" },
  { key: "remote_work", label: "Find remote work" },
  { key: "internship", label: "Get an internship" },
  { key: "graduate", label: "Launch a graduate career" },
  { key: "contract", label: "Find contract work" },
  { key: "freelance", label: "Find freelance clients" },
  { key: "career_change", label: "Change careers" },
  { key: "application_improvement", label: "Improve my applications" },
  { key: "interview_preparation", label: "Prepare for interviews" },
  { key: "exploration", label: "Explore my options" },
];

const STEPS = [
  "Goals", "About you", "Summary", "Experience", "Education", "Skills", "Projects",
  "Credentials", "Job preferences", "CV & writing", "Review",
];

/* -------------------------------------------------------------------------- page */

export default function OnboardingPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { user, refresh } = useAuth();
  const { resolved, toggle } = useTheme();
  const { toast } = useToast();
  const [step, setStep] = React.useState(1);
  const [draft, setDraft] = React.useState<Draft>(EMPTY_DRAFT);
  const [hydrated, setHydrated] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [completing, setCompleting] = React.useState(false);
  const [importing, setImporting] = React.useState(false);
  const [importResult, setImportResult] = React.useState<CvImportResult | null>(null);
  const [importError, setImportError] = React.useState("");
  const [done, setDone] = React.useState(false);

  const statusQuery = useQuery({
    queryKey: ["onboarding"],
    queryFn: () => api.get<OnboardingStatus>("/onboarding/status"),
  });

  React.useEffect(() => {
    if (!statusQuery.data || hydrated) return;
    const saved = (statusQuery.data.draft?.data ?? {}) as Partial<Draft>;
    const merged: Draft = {
      ...EMPTY_DRAFT,
      ...saved,
      profile: { ...EMPTY_DRAFT.profile, ...(saved.profile ?? {}) },
      preferences: { ...EMPTY_PREFERENCES, ...(saved.preferences ?? {}) },
      writing_style: { ...EMPTY_WRITING, ...(saved.writing_style ?? {}) },
      experiences: (saved.experiences ?? []).map((item) => ({ ...EMPTY_EXPERIENCE, ...item })),
      education: (saved.education ?? []).map((item) => ({ ...EMPTY_EDUCATION, ...item })),
      skills: (saved.skills ?? []).map((item) => ({ ...EMPTY_SKILL, ...item })),
      projects: (saved.projects ?? []).map((item) => ({ ...EMPTY_PROJECT, ...item })),
      certifications: (saved.certifications ?? []).map((item) => ({ ...EMPTY_CERTIFICATION, ...item })),
      achievements: (saved.achievements ?? []).map((item) => ({ ...EMPTY_ACHIEVEMENT, ...item })),
      confirmations: { ...EMPTY_DRAFT.confirmations, ...(saved.confirmations ?? {}) },
      cv_import: saved.cv_import ?? {},
    };
    setDraft(merged);
    const draftStep = statusQuery.data.draft?.step ?? 1;
    setStep(Math.min(11, Math.max(statusQuery.data.completed ? 11 : 1, draftStep)));
    setHydrated(true);
  }, [statusQuery.data, hydrated]);

  React.useEffect(() => {
    if (statusQuery.data?.completed && !done) setDone(true);
  }, [statusQuery.data, done]);

  const update = <K extends keyof Draft>(key: K, value: Draft[K]) => {
    setDraft((current) => ({ ...current, [key]: value }));
  };

  const saveDraft = async (nextStep: number) => {
    setSaving(true);
    try {
      await api.put("/onboarding/draft", { step: nextStep, data: draft });
      await queryClient.invalidateQueries({ queryKey: ["onboarding"] });
    } catch (caught) {
      toast({ title: "Could not save progress",
              description: caught instanceof ApiError ? caught.message : undefined, tone: "error" });
      throw caught;
    } finally {
      setSaving(false);
    }
  };

  const goTo = async (next: number) => {
    const bounded = Math.min(11, Math.max(1, next));
    try {
      await saveDraft(bounded);
      setStep(bounded);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch {
      /* the toast explains the failure */
    }
  };

  const uploadCv = async (file: File) => {
    setImporting(true);
    setImportError("");
    setImportResult(null);
    try {
      const form = new FormData();
      form.append("file", file);
      const result = await api.upload<CvImportResult>("/onboarding/import-cv", form);
      setImportResult(result);
      setDraft((current) => ({
        ...current,
        cv_import: { upload_id: result.upload_id, filename: result.filename },
      }));
      toast({ title: "CV parsed for review",
              description: "Nothing has been added to your profile yet. Choose what to keep below.",
              tone: "success" });
    } catch (caught) {
      setImportError(caught instanceof ApiError ? caught.message : "Upload failed.");
    } finally {
      setImporting(false);
    }
  };

  const mergeImported = (sections: string[]) => {
    if (!importResult) return;
    const extracted = importResult.extracted;
    setDraft((current) => {
      const next = { ...current };
      if (sections.includes("profile") && extracted.profile) {
        const profile = extracted.profile;
        next.profile = {
          ...current.profile,
          preferred_name: current.profile.preferred_name || profile.preferred_name || "",
          professional_headline: current.profile.professional_headline || profile.professional_headline || "",
          summary: current.profile.summary || profile.summary || "",
          phone: current.profile.phone || profile.phone || "",
        };
      }
      if (sections.includes("experiences")) {
        const existing = new Set(current.experiences.map((item) => `${item.employer}|${item.title}`.toLowerCase()));
        next.experiences = [...current.experiences, ...(extracted.experiences ?? [])
          .filter((item) => !existing.has(`${item.employer}|${item.title}`.toLowerCase()))
          .map((item) => ({ ...EMPTY_EXPERIENCE, ...item, verified: false,
            provenance: "document_extracted" }))];
      }
      if (sections.includes("education")) {
        const existing = new Set(current.education.map((item) => `${item.institution}|${item.qualification}`.toLowerCase()));
        next.education = [...current.education, ...(extracted.education ?? [])
          .filter((item) => !existing.has(`${item.institution}|${item.qualification}`.toLowerCase()))
          .map((item) => ({ ...EMPTY_EDUCATION, ...item, verified: false,
            provenance: "document_extracted" }))];
      }
      if (sections.includes("skills")) {
        const existing = new Set(current.skills.map((item) => item.name.toLowerCase()));
        next.skills = [...current.skills, ...(extracted.skills ?? [])
          .filter((item) => item.name && !existing.has(item.name.toLowerCase()))
          .map((item) => ({ ...EMPTY_SKILL, ...item, verified: false,
            provenance: "document_extracted" }))];
      }
      if (sections.includes("projects")) {
        const existing = new Set(current.projects.map((item) => item.name.toLowerCase()));
        next.projects = [...current.projects, ...(extracted.projects ?? [])
          .filter((item) => item.name && !existing.has(item.name.toLowerCase()))
          .map((item) => ({ ...EMPTY_PROJECT, ...item, verified: false,
            provenance: "document_extracted" }))];
      }
      if (sections.includes("certifications")) {
        const existing = new Set(current.certifications.map((item) => item.name.toLowerCase()));
        next.certifications = [...current.certifications, ...(extracted.certifications ?? [])
          .filter((item) => item.name && !existing.has(item.name.toLowerCase()))
          .map((item) => ({ ...EMPTY_CERTIFICATION, ...item, verified: false,
            provenance: "document_extracted" }))];
      }
      if (sections.includes("achievements")) {
        const existing = new Set(current.achievements.map((item) => item.title.toLowerCase()));
        next.achievements = [...current.achievements, ...(extracted.achievements ?? [])
          .filter((item) => item.title && !existing.has(item.title.toLowerCase()))
          .map((item) => ({ ...EMPTY_ACHIEVEMENT, ...item, verified: false,
            provenance: "document_extracted" }))];
      }
      return next;
    });
    toast({ title: "Imported items added as unverified",
            description: "Review each entry. Imported data never counts as verified until you confirm it.",
            tone: "info" });
  };

  const complete = async () => {
    const confirmations = draft.confirmations;
    if (!confirmations.accuracy || !confirmations.consent) {
      toast({ title: "Confirm the required statements", tone: "error" });
      return;
    }
    setCompleting(true);
    try {
      await api.post("/onboarding/complete", {
        data: draft,
        profile: {
          ...draft.profile,
          career_objectives: draft.objectives,
        },
        experiences: draft.experiences,
        education: draft.education,
        skills: draft.skills,
        projects: draft.projects,
        certifications: draft.certifications,
        achievements: draft.achievements,
        preferences: draft.preferences,
        writing_style: draft.writing_style,
        cv_import: draft.cv_import,
      });
      await refresh();
      await queryClient.invalidateQueries({ queryKey: ["onboarding"] });
      setDone(true);
    } catch (caught) {
      toast({ title: "Could not complete onboarding",
              description: caught instanceof ApiError ? caught.message : undefined, tone: "error" });
    } finally {
      setCompleting(false);
    }
  };

  if (done) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-16 text-center">
        <span className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-[var(--brand)] text-[#061007]">
          <CheckCircle2 className="h-7 w-7" aria-hidden="true" />
        </span>
        <h1 className="mt-5 text-3xl font-bold tracking-tight">Your workspace is ready</h1>
        <p className="mt-2 text-[var(--muted)]">
          Import a job or add a public job board to see your first explainable match.
          You can refine every profile detail at any time; previously saved versions are never overwritten silently.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <Link href="/discover"><Button>Discover jobs</Button></Link>
          <Link href="/dashboard"><Button variant="outline">Go to dashboard</Button></Link>
          <Link href="/profile"><Button variant="ghost">Review profile</Button></Link>
        </div>
      </div>
    );
  }

  if (statusQuery.isLoading || !hydrated) {
    return (
      <div className="grid min-h-dvh place-items-center">
        <div className="flex items-center gap-2 text-sm text-[var(--muted)]">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> Loading onboarding…
        </div>
      </div>
    );
  }

  const imported = Boolean(draft.cv_import.upload_id);
  const hasImportedItems = [
    ...draft.experiences, ...draft.education, ...draft.skills, ...draft.projects,
    ...draft.certifications, ...draft.achievements,
  ].some((item) => (item as { provenance?: string }).provenance === "document_extracted");

  return (
    <div className="min-h-dvh bg-[var(--bg)]">
      <header className="sticky top-0 z-30 border-b bg-[var(--surface)]/95 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-3 px-4">
          <Link href="/dashboard" aria-label="CareerPilot AI"><Logo /></Link>
          <div className="flex items-center gap-2">
            <span className="hidden text-xs text-[var(--muted)] sm:block">
              {user?.email}
            </span>
            <Button variant="ghost" size="sm" onClick={toggle}
                    aria-label={`Switch to ${resolved === "dark" ? "light" : "dark"} theme`}>
              {resolved === "dark" ? "Light" : "Dark"}
            </Button>
            <Button variant="outline" size="sm" onClick={() => void saveDraft(step).then(() => router.push("/dashboard"))}
                    loading={saving}>
              <Save className="h-3.5 w-3.5" aria-hidden="true" /> Save &amp; exit
            </Button>
          </div>
        </div>
        <div className="mx-auto max-w-6xl px-4 pb-3">
          <Progress value={(step / 11) * 100} label={`Step ${step} of 11 · ${STEPS[step - 1]}`} />
        </div>
      </header>

      <div className="mx-auto grid max-w-6xl gap-6 px-4 py-6 lg:grid-cols-[240px_1fr]">
        <nav aria-label="Onboarding steps" className="hidden lg:block">
          <ol className="space-y-1">
            {STEPS.map((label, index) => {
              const number = index + 1;
              const active = number === step;
              const complete = number < step;
              return (
                <li key={label}>
                  <button type="button" onClick={() => void goTo(number)}
                          aria-current={active ? "step" : undefined}
                          className={cn(
                            "flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm",
                            active ? "bg-[var(--surface-2)] font-semibold" : "text-[var(--muted)] hover:bg-[var(--surface-2)]"
                          )}>
                    <span className={cn(
                      "grid h-6 w-6 shrink-0 place-items-center rounded-full border text-[11px]",
                      active && "border-[var(--brand)] bg-[var(--brand)] text-[#061007]",
                      complete && !active && "border-[var(--brand)] text-[var(--brand)]"
                    )}>
                      {complete && !active ? <Check className="h-3 w-3" aria-hidden="true" /> : number}
                    </span>
                    {label}
                  </button>
                </li>
              );
            })}
          </ol>
          <p className="mt-4 px-2.5 text-[11px] text-[var(--muted)]">
            Progress saves to your account after each step. You can return later.
          </p>
        </nav>

        <main>
          <div className="cp-card p-5 sm:p-6">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--brand)]">
              Step {step} of 11
            </p>
            <h1 className="mt-1 text-2xl font-bold tracking-tight">{STEPS[step - 1]}</h1>

            <div className="mt-5">
              {step === 1 ? (
                <div className="space-y-5">
                  <p className="text-sm text-[var(--muted)]">
                    What are you trying to achieve? This shapes recommendations, not your qualifications.
                  </p>
                  <CheckGrid label="Goals" options={OBJECTIVES} value={draft.objectives}
                             onChange={(value) => update("objectives", value)} />
                  <Field label="Target job titles" htmlFor="target-titles"
                         help="Add up to 20 titles. Press Enter after each.">
                    <TagsInput id="target-titles" ariaLabel="Target job titles"
                               value={draft.preferences.desired_titles}
                               onChange={(value) => update("preferences", { ...draft.preferences, desired_titles: value })}
                               placeholder="Backend Engineer" />
                  </Field>
                  <Alert tone="info">
                    Nothing here is shared with employers. CareerPilot never auto-applies to jobs.
                  </Alert>
                </div>
              ) : null}

              {step === 2 ? (
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Preferred name" htmlFor="preferred-name">
                    <Input id="preferred-name" value={draft.profile.preferred_name}
                           onChange={(event) => update("profile", { ...draft.profile, preferred_name: event.target.value })} />
                  </Field>
                  <Field label="Professional headline" htmlFor="headline"
                         help="Example: Backend engineer · APIs, Python, PostgreSQL">
                    <Input id="headline" value={draft.profile.professional_headline}
                           onChange={(event) => update("profile", { ...draft.profile, professional_headline: event.target.value })} />
                  </Field>
                  <Field label="City" htmlFor="city">
                    <Input id="city" value={draft.profile.city}
                           onChange={(event) => update("profile", { ...draft.profile, city: event.target.value })} />
                  </Field>
                  <Field label="Country" htmlFor="country">
                    <Input id="country" value={draft.profile.country}
                           onChange={(event) => update("profile", { ...draft.profile, country: event.target.value })} />
                  </Field>
                  <Field label="Phone" htmlFor="phone" help="Used only in documents if you allow it.">
                    <Input id="phone" value={draft.profile.phone}
                           onChange={(event) => update("profile", { ...draft.profile, phone: event.target.value })} />
                  </Field>
                  <div className="flex items-end">
                    <p className="text-xs text-[var(--muted)]">
                      Your sign-in email is managed in settings and is never shown on generated documents
                      unless you add it to a CV header.
                    </p>
                  </div>
                </div>
              ) : null}

              {step === 3 ? (
                <div className="space-y-4">
                  <Field label="Professional summary" htmlFor="summary"
                         help="Write your own summary. Do not invent metrics or responsibilities.">
                    <Textarea id="summary" rows={8} value={draft.profile.summary}
                              onChange={(event) => update("profile", { ...draft.profile, summary: event.target.value })} />
                  </Field>
                  <p className="text-xs text-[var(--muted)]">
                    {draft.profile.summary.length}/4000 characters. You can refine this later on the profile page.
                  </p>
                </div>
              ) : null}

              {step === 4 ? (
                <ListStep
                  items={draft.experiences}
                  empty={EMPTY_EXPERIENCE}
                  addLabel="Add work experience"
                  onChange={(items) => update("experiences", items)}
                  render={(item, set) => (
                    <>
                      <div className="grid gap-3 sm:grid-cols-2">
                        <Field label="Job title" required>
                          <Input value={item.title} onChange={(event) => set({ title: event.target.value })} />
                        </Field>
                        <Field label="Employer" required>
                          <Input value={item.employer} onChange={(event) => set({ employer: event.target.value })} />
                        </Field>
                        <Field label="Employment type">
                          <Select value={item.employment_type}
                                  onChange={(event) => set({ employment_type: event.target.value })}>
                            {["full_time", "part_time", "contract", "internship", "freelance", "volunteer"].map((value) => (
                              <option key={value} value={value}>{value.replace(/_/g, " ")}</option>
                            ))}
                          </Select>
                        </Field>
                        <Field label="Location">
                          <Input value={item.location} onChange={(event) => set({ location: event.target.value })} />
                        </Field>
                        <Field label="Start date">
                          <Input type="date" value={item.start_date}
                                 onChange={(event) => set({ start_date: event.target.value })} />
                        </Field>
                        <Field label="End date">
                          <Input type="date" value={item.end_date} disabled={item.is_current}
                                 onChange={(event) => set({ end_date: event.target.value })} />
                        </Field>
                      </div>
                      <div className="flex flex-wrap gap-4">
                        <label className="flex items-center gap-2 text-sm">
                          <input type="checkbox" className="h-4 w-4 accent-[#39FF14]" checked={item.is_current}
                                 onChange={(event) => set({ is_current: event.target.checked, end_date: "" })} />
                          Current role
                        </label>
                        <label className="flex items-center gap-2 text-sm">
                          <input type="checkbox" className="h-4 w-4 accent-[#39FF14]" checked={item.is_remote}
                                 onChange={(event) => set({ is_remote: event.target.checked })} />
                          Remote
                        </label>
                        <label className="flex items-center gap-2 text-sm">
                          <input type="checkbox" className="h-4 w-4 accent-[#39FF14]" checked={item.verified}
                                 onChange={(event) => set({ verified: event.target.checked })} />
                          I confirm this is accurate
                        </label>
                      </div>
                      <Field label="Responsibilities" help="What you actually did.">
                        <Textarea rows={3} value={item.description}
                                  onChange={(event) => set({ description: event.target.value })} />
                      </Field>
                      <Field label="Achievements" help="One per line. Use real, defensible outcomes only.">
                        <Textarea rows={3} value={item.achievements.join("\n")}
                                  onChange={(event) => set({ achievements: event.target.value.split("\n").map((v) => v.trim()).filter(Boolean) })} />
                      </Field>
                      <Field label="Tools used" help="Comma separated.">
                        <TagsInput ariaLabel="Tools" value={item.tools}
                                   onChange={(value) => set({ tools: value })} />
                      </Field>
                    </>
                  )}
                />
              ) : null}

              {step === 5 ? (
                <ListStep
                  items={draft.education}
                  empty={EMPTY_EDUCATION}
                  addLabel="Add education"
                  onChange={(items) => update("education", items)}
                  render={(item, set) => (
                    <>
                      <div className="grid gap-3 sm:grid-cols-2">
                        <Field label="Institution" required>
                          <Input value={item.institution} onChange={(event) => set({ institution: event.target.value })} />
                        </Field>
                        <Field label="Qualification">
                          <Input value={item.qualification} onChange={(event) => set({ qualification: event.target.value })} />
                        </Field>
                        <Field label="Field of study">
                          <Input value={item.field_of_study} onChange={(event) => set({ field_of_study: event.target.value })} />
                        </Field>
                        <Field label="Location">
                          <Input value={item.location} onChange={(event) => set({ location: event.target.value })} />
                        </Field>
                        <Field label="Start date">
                          <Input type="date" value={item.start_date}
                                 onChange={(event) => set({ start_date: event.target.value })} />
                        </Field>
                        <Field label="End date">
                          <Input type="date" value={item.end_date}
                                 onChange={(event) => set({ end_date: event.target.value })} />
                        </Field>
                      </div>
                      <Field label="Status">
                        <Select value={item.status} onChange={(event) => set({ status: event.target.value })}>
                          {["completed", "in_progress", "incomplete", "withdrawn"].map((value) => (
                            <option key={value} value={value}>{value.replace(/_/g, " ")}</option>
                          ))}
                        </Select>
                      </Field>
                      <Field label="Coursework / notes">
                        <Textarea rows={3} value={item.coursework}
                                  onChange={(event) => set({ coursework: event.target.value })} />
                      </Field>
                      <label className="flex items-center gap-2 text-sm">
                        <input type="checkbox" className="h-4 w-4 accent-[#39FF14]" checked={item.verified}
                               onChange={(event) => set({ verified: event.target.checked })} />
                        I confirm this is accurate
                      </label>
                    </>
                  )}
                />
              ) : null}

              {step === 6 ? (
                <ListStep
                  items={draft.skills}
                  empty={EMPTY_SKILL}
                  addLabel="Add skill"
                  onChange={(items) => update("skills", items)}
                  render={(item, set) => (
                    <>
                      <div className="grid gap-3 sm:grid-cols-2">
                        <Field label="Skill" required>
                          <Input value={item.name} onChange={(event) => set({ name: event.target.value })} />
                        </Field>
                        <Field label="Category">
                          <Input value={item.category} onChange={(event) => set({ category: event.target.value })} />
                        </Field>
                        <Field label="Proficiency">
                          <Select value={item.proficiency} onChange={(event) => set({ proficiency: event.target.value })}>
                            {["beginner", "intermediate", "advanced", "expert", "unspecified"].map((value) => (
                              <option key={value} value={value}>{value}</option>
                            ))}
                          </Select>
                        </Field>
                        <Field label="Years of experience">
                          <Input type="number" min={0} max={60} step={0.5} value={item.years_experience}
                                 onChange={(event) => set({ years_experience: event.target.value })} />
                        </Field>
                      </div>
                      <Field label="Evidence" help="Where have you used this? Required for expert level.">
                        <Textarea rows={2} value={item.evidence}
                                  onChange={(event) => set({ evidence: event.target.value })} />
                      </Field>
                      <label className="flex items-center gap-2 text-sm">
                        <input type="checkbox" className="h-4 w-4 accent-[#39FF14]" checked={item.verified}
                               onChange={(event) => set({ verified: event.target.checked })} />
                        I can use this skill in a professional context
                      </label>
                    </>
                  )}
                />
              ) : null}

              {step === 7 ? (
                <ListStep
                  items={draft.projects}
                  empty={EMPTY_PROJECT}
                  addLabel="Add project"
                  onChange={(items) => update("projects", items)}
                  render={(item, set) => (
                    <>
                      <Field label="Project name" required>
                        <Input value={item.name} onChange={(event) => set({ name: event.target.value })} />
                      </Field>
                      <Field label="Description">
                        <Textarea rows={3} value={item.description}
                                  onChange={(event) => set({ description: event.target.value })} />
                      </Field>
                      <div className="grid gap-3 sm:grid-cols-2">
                        <Field label="Repository URL">
                          <Input value={item.repo_url} placeholder="https://github.com/…"
                                 onChange={(event) => set({ repo_url: event.target.value })} />
                        </Field>
                        <Field label="Demo URL">
                          <Input value={item.demo_url} placeholder="https://…"
                                 onChange={(event) => set({ demo_url: event.target.value })} />
                        </Field>
                      </div>
                      <Field label="Technologies">
                        <TagsInput ariaLabel="Project technologies" value={item.technologies}
                                   onChange={(value) => set({ technologies: value })} />
                      </Field>
                      <Field label="Outcomes" help="What changed because of this work? Keep it factual.">
                        <Textarea rows={2} value={item.outcomes}
                                  onChange={(event) => set({ outcomes: event.target.value })} />
                      </Field>
                      <label className="flex items-center gap-2 text-sm">
                        <input type="checkbox" className="h-4 w-4 accent-[#39FF14]" checked={item.verified}
                               onChange={(event) => set({ verified: event.target.checked })} />
                        I confirm this project is mine
                      </label>
                    </>
                  )}
                />
              ) : null}

              {step === 8 ? (
                <div className="space-y-8">
                  <ListStep
                    items={draft.certifications}
                    empty={EMPTY_CERTIFICATION}
                    addLabel="Add certification"
                    onChange={(items) => update("certifications", items)}
                    render={(item, set) => (
                      <>
                        <div className="grid gap-3 sm:grid-cols-2">
                          <Field label="Certification" required>
                            <Input value={item.name} onChange={(event) => set({ name: event.target.value })} />
                          </Field>
                          <Field label="Issuer">
                            <Input value={item.issuer} onChange={(event) => set({ issuer: event.target.value })} />
                          </Field>
                          <Field label="Issue date">
                            <Input type="date" value={item.issue_date}
                                   onChange={(event) => set({ issue_date: event.target.value })} />
                          </Field>
                          <Field label="Credential URL">
                            <Input value={item.credential_url} placeholder="https://…"
                                   onChange={(event) => set({ credential_url: event.target.value })} />
                          </Field>
                        </div>
                      </>
                    )}
                  />
                  <ListStep
                    items={draft.achievements}
                    empty={EMPTY_ACHIEVEMENT}
                    addLabel="Add achievement"
                    onChange={(items) => update("achievements", items)}
                    render={(item, set) => (
                      <>
                        <div className="grid gap-3 sm:grid-cols-2">
                          <Field label="Title" required>
                            <Input value={item.title} onChange={(event) => set({ title: event.target.value })} />
                          </Field>
                          <Field label="Category">
                            <Select value={item.category} onChange={(event) => set({ category: event.target.value })}>
                              {["professional", "academic", "community", "award", "publication", "other"].map((value) => (
                                <option key={value} value={value}>{value}</option>
                              ))}
                            </Select>
                          </Field>
                          <Field label="Date">
                            <Input type="date" value={item.date}
                                   onChange={(event) => set({ date: event.target.value })} />
                          </Field>
                          <Field label="Evidence URL">
                            <Input value={item.evidence_url} placeholder="https://…"
                                   onChange={(event) => set({ evidence_url: event.target.value })} />
                          </Field>
                        </div>
                        <Field label="Description">
                          <Textarea rows={2} value={item.description}
                                    onChange={(event) => set({ description: event.target.value })} />
                        </Field>
                      </>
                    )}
                  />
                </div>
              ) : null}

              {step === 9 ? (
                <div className="space-y-4">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Field label="Experience level" htmlFor="experience-level">
                      <Select id="experience-level" value={draft.preferences.experience_level}
                              onChange={(event) => update("preferences", { ...draft.preferences, experience_level: event.target.value })}>
                        <option value="">No preference</option>
                        {["internship", "entry", "junior", "mid", "senior", "lead", "principal", "executive"].map((value) => (
                          <option key={value} value={value}>{value}</option>
                        ))}
                      </Select>
                    </Field>
                    <Field label="Work authorization" htmlFor="authorization">
                      <Input id="authorization" value={draft.preferences.work_authorization}
                             placeholder="e.g. EU citizen, requires sponsorship"
                             onChange={(event) => update("preferences", { ...draft.preferences, work_authorization: event.target.value })} />
                    </Field>
                  </div>
                  <CheckGrid label="Work arrangements"
                             options={[{ key: "remote", label: "Remote" }, { key: "hybrid", label: "Hybrid" },
                                       { key: "onsite", label: "On-site" }]}
                             value={draft.preferences.work_arrangements}
                             onChange={(value) => update("preferences", { ...draft.preferences, work_arrangements: value })} />
                  <CheckGrid label="Employment types"
                             options={[{ key: "full_time", label: "Full-time" }, { key: "part_time", label: "Part-time" },
                                       { key: "contract", label: "Contract" }, { key: "internship", label: "Internship" },
                                       { key: "freelance", label: "Freelance" }]}
                             value={draft.preferences.employment_types}
                             onChange={(value) => update("preferences", { ...draft.preferences, employment_types: value })} />
                  <Field label="Countries" htmlFor="countries" help="Where can you work? Press Enter after each.">
                    <TagsInput id="countries" ariaLabel="Countries" value={draft.preferences.countries}
                               onChange={(value) => update("preferences", { ...draft.preferences, countries: value })} />
                  </Field>
                  <div className="grid gap-3 sm:grid-cols-3">
                    <Field label="Salary minimum" htmlFor="salary-min">
                      <Input id="salary-min" type="number" min={0} value={draft.preferences.salary_min ?? ""}
                             onChange={(event) => update("preferences", {
                               ...draft.preferences,
                               salary_min: event.target.value ? Number(event.target.value) : null,
                             })} />
                    </Field>
                    <Field label="Salary maximum" htmlFor="salary-max">
                      <Input id="salary-max" type="number" min={0} value={draft.preferences.salary_max ?? ""}
                             onChange={(event) => update("preferences", {
                               ...draft.preferences,
                               salary_max: event.target.value ? Number(event.target.value) : null,
                             })} />
                    </Field>
                    <Field label="Currency" htmlFor="currency">
                      <Select id="currency" value={draft.preferences.currency}
                              onChange={(event) => update("preferences", { ...draft.preferences, currency: event.target.value })}>
                        {["USD", "EUR", "GBP", "NGN", "CAD", "AUD", "INR", "ZAR", "KES"].map((value) => (
                          <option key={value} value={value}>{value}</option>
                        ))}
                      </Select>
                    </Field>
                  </div>
                  <Field label="Relocation" htmlFor="relocation">
                    <Select id="relocation" value={draft.preferences.relocation}
                            onChange={(event) => update("preferences", { ...draft.preferences, relocation: event.target.value })}>
                      <option value="yes">Willing to relocate</option>
                      <option value="maybe">Open to discussion</option>
                      <option value="no">Prefer not to relocate</option>
                    </Select>
                  </Field>
                  <Field label="Preferred technologies" htmlFor="tech">
                    <TagsInput id="tech" ariaLabel="Preferred technologies" value={draft.preferences.preferred_technologies}
                               onChange={(value) => update("preferences", { ...draft.preferences, preferred_technologies: value })} />
                  </Field>
                  <Field label="Anything else" htmlFor="pref-notes">
                    <Textarea id="pref-notes" rows={2} value={draft.preferences.notes}
                              onChange={(event) => update("preferences", { ...draft.preferences, notes: event.target.value })} />
                  </Field>
                </div>
              ) : null}

              {step === 10 ? (
                <div className="space-y-6">
                  <section aria-labelledby="cv-import">
                    <h2 id="cv-import" className="text-lg font-semibold">Import an existing CV</h2>
                    <p className="mt-1 text-sm text-[var(--muted)]">
                      Upload a PDF or DOCX. Extraction runs on the server; nothing is added to your profile until you confirm it.
                      Scanned image-only PDFs may not extract.
                    </p>
                    <label className={cn(
                      "mt-3 flex cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed p-6 text-center",
                      "hover:border-[var(--brand)]"
                    )}>
                      <input type="file" accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                             className="sr-only"
                             onChange={(event) => {
                               const file = event.target.files?.[0];
                               if (file) void uploadCv(file);
                               event.target.value = "";
                             }} />
                      {importing ? (
                        <><Loader2 className="h-6 w-6 animate-spin text-[var(--brand)]" aria-hidden="true" />
                          <span className="text-sm">Extracting text…</span></>
                      ) : (
                        <><UploadCloud className="h-7 w-7 text-[var(--brand)]" aria-hidden="true" />
                          <span className="text-sm font-medium">Choose a PDF or DOCX file</span>
                          <span className="text-xs text-[var(--muted)]">Maximum size configured by the server</span></>
                      )}
                    </label>
                    <p className="mt-2 flex items-center gap-1 text-xs text-[var(--muted)]">
                      <FileUp className="h-3 w-3" aria-hidden="true" />
                      Uploads are stored privately; you can delete them with your account.
                    </p>

                    {importError ? (
                      <Alert tone="danger" title="Import failed" className="mt-3">{importError}</Alert>
                    ) : null}

                    {importResult ? (
                      <div className="mt-4 space-y-3">
                        <Alert tone="success" title={`Parsed ${importResult.filename}`}>
                          {importResult.message}
                        </Alert>
                        {importResult.warnings.length ? (
                          <Alert tone="warning" title="Extraction warnings">
                            <ul className="list-disc pl-4">
                              {importResult.warnings.map((warning) => <li key={warning}>{warning}</li>)}
                            </ul>
                          </Alert>
                        ) : null}
                        <div className="grid gap-2 sm:grid-cols-2">
                          <ImportSection label="Profile details" count={importResult.extracted.profile ? 1 : 0}
                                         onAdd={() => mergeImported(["profile"])} />
                          <ImportSection label="Experience" count={importResult.extracted.experiences?.length ?? 0}
                                         onAdd={() => mergeImported(["experiences"])} />
                          <ImportSection label="Education" count={importResult.extracted.education?.length ?? 0}
                                         onAdd={() => mergeImported(["education"])} />
                          <ImportSection label="Skills" count={importResult.extracted.skills?.length ?? 0}
                                         onAdd={() => mergeImported(["skills"])} />
                          <ImportSection label="Projects" count={importResult.extracted.projects?.length ?? 0}
                                         onAdd={() => mergeImported(["projects"])} />
                          <ImportSection label="Certifications" count={importResult.extracted.certifications?.length ?? 0}
                                         onAdd={() => mergeImported(["certifications"])} />
                          <ImportSection label="Achievements" count={importResult.extracted.achievements?.length ?? 0}
                                         onAdd={() => mergeImported(["achievements"])} />
                        </div>
                        <p className="text-xs text-[var(--muted)]">
                          Imported items are marked unverified and use provenance “document extracted”.
                          Confirm or edit them on the profile page later.
                        </p>
                      </div>
                    ) : imported ? (
                      <Alert tone="info" className="mt-3" title="Imported CV on file">
                        {draft.cv_import.filename} · upload retained for this onboarding draft.
                      </Alert>
                    ) : null}
                  </section>

                  <section aria-labelledby="writing-style" className="border-t pt-5">
                    <h2 id="writing-style" className="text-lg font-semibold">Writing preferences</h2>
                    <p className="mt-1 text-sm text-[var(--muted)]">
                      These guide drafts. They never fabricate facts.
                    </p>
                    <div className="mt-3 grid gap-3 sm:grid-cols-2">
                      <Field label="Tone" htmlFor="tone">
                        <Select id="tone" value={draft.writing_style.tone}
                                onChange={(event) => update("writing_style", { ...draft.writing_style, tone: event.target.value })}>
                          {["professional", "formal", "conversational", "direct", "warm"].map((value) => (
                            <option key={value} value={value}>{value}</option>
                          ))}
                        </Select>
                      </Field>
                      <Field label="Length preference" htmlFor="length">
                        <Select id="length" value={draft.writing_style.length_preference}
                                onChange={(event) => update("writing_style", { ...draft.writing_style, length_preference: event.target.value })}>
                          {["concise", "balanced", "detailed"].map((value) => (
                            <option key={value} value={value}>{value}</option>
                          ))}
                        </Select>
                      </Field>
                      <Field label="Confidence" htmlFor="confidence">
                        <Select id="confidence" value={draft.writing_style.confidence}
                                onChange={(event) => update("writing_style", { ...draft.writing_style, confidence: event.target.value })}>
                          {["measured", "confident", "assertive"].map((value) => (
                            <option key={value} value={value}>{value}</option>
                          ))}
                        </Select>
                      </Field>
                      <Field label="Technicality" htmlFor="technicality">
                        <Select id="technicality" value={draft.writing_style.technicality}
                                onChange={(event) => update("writing_style", { ...draft.writing_style, technicality: event.target.value })}>
                          {["plain", "balanced", "technical"].map((value) => (
                            <option key={value} value={value}>{value}</option>
                          ))}
                        </Select>
                      </Field>
                      <Field label="Default CV template" htmlFor="cv-style">
                        <Select id="cv-style" value={draft.writing_style.cv_style}
                                onChange={(event) => update("writing_style", { ...draft.writing_style, cv_style: event.target.value })}>
                          {["ats", "modern_developer", "backend_engineer", "ai_engineer", "graduate", "academic"].map((value) => (
                            <option key={value} value={value}>{value.replace(/_/g, " ")}</option>
                          ))}
                        </Select>
                      </Field>
                      <Field label="Cover letter length" htmlFor="cover-length">
                        <Select id="cover-length" value={draft.writing_style.cover_letter_length}
                                onChange={(event) => update("writing_style", { ...draft.writing_style, cover_letter_length: event.target.value })}>
                          {["short", "standard", "detailed"].map((value) => (
                            <option key={value} value={value}>{value}</option>
                          ))}
                        </Select>
                      </Field>
                    </div>
                    <div className="mt-3 space-y-3">
                      <Field label="Words to avoid" htmlFor="avoid-words">
                        <TagsInput id="avoid-words" ariaLabel="Words to avoid" value={draft.writing_style.avoid_words}
                                   onChange={(value) => update("writing_style", { ...draft.writing_style, avoid_words: value })} />
                      </Field>
                      <Field label="Writing sample (optional)" htmlFor="writing-sample"
                             help="Used only to match tone. Never published.">
                        <Textarea id="writing-sample" rows={3} value={draft.writing_style.writing_samples}
                                  onChange={(event) => update("writing_style", { ...draft.writing_style, writing_samples: event.target.value })} />
                      </Field>
                      <label className="flex items-start gap-2 text-sm">
                        <input type="checkbox" className="mt-0.5 h-4 w-4 accent-[#39FF14]"
                               checked={draft.writing_style.sample_permission}
                               onChange={(event) => update("writing_style", {
                                 ...draft.writing_style, sample_permission: event.target.checked,
                               })} />
                        I allow this writing sample to be used for style guidance.
                      </label>
                    </div>
                  </section>
                </div>
              ) : null}

              {step === 11 ? (
                <div className="space-y-5">
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    <SummaryTile label="Goals" value={`${draft.objectives.length} selected`} />
                    <SummaryTile label="Experience" value={`${draft.experiences.length} entries`} />
                    <SummaryTile label="Education" value={`${draft.education.length} entries`} />
                    <SummaryTile label="Skills" value={`${draft.skills.length} entries`} />
                    <SummaryTile label="Projects" value={`${draft.projects.length} entries`} />
                    <SummaryTile label="Credentials" value={`${draft.certifications.length + draft.achievements.length} entries`} />
                  </div>

                  {hasImportedItems ? (
                    <Alert tone="warning" title="Imported items need your confirmation">
                      Some entries came from a CV and are marked unverified. They will not be used in documents
                      until you confirm them. You can edit and verify them on the profile page after onboarding.
                    </Alert>
                  ) : null}

                  {!draft.experiences.length && !draft.skills.length ? (
                    <Alert tone="warning" title="Very little career data">
                      Matching will be weak without experience or skills. You can continue and add data later.
                    </Alert>
                  ) : null}

                  <div className="space-y-3 rounded-xl border p-4">
                    <label className="flex items-start gap-2 text-sm">
                      <input type="checkbox" className="mt-0.5 h-4 w-4 accent-[#39FF14]"
                             checked={draft.confirmations.accuracy}
                             onChange={(event) => update("confirmations", {
                               ...draft.confirmations, accuracy: event.target.checked,
                             })} />
                      <span>
                        <span className="font-medium">I confirm the information above is accurate.</span>
                        <span className="mt-0.5 block text-xs text-[var(--muted)]">
                          I have not included employers, qualifications, metrics or achievements I cannot defend.
                        </span>
                      </span>
                    </label>
                    <label className="flex items-start gap-2 text-sm">
                      <input type="checkbox" className="mt-0.5 h-4 w-4 accent-[#39FF14]"
                             checked={draft.confirmations.unverified}
                             onChange={(event) => update("confirmations", {
                               ...draft.confirmations, unverified: event.target.checked,
                             })} />
                      <span>
                        <span className="font-medium">I understand imported and AI-suggested items are unverified.</span>
                        <span className="mt-0.5 block text-xs text-[var(--muted)]">
                          Only records I confirm can be used in generated documents.
                        </span>
                      </span>
                    </label>
                    <label className="flex items-start gap-2 text-sm">
                      <input type="checkbox" className="mt-0.5 h-4 w-4 accent-[#39FF14]"
                             checked={draft.confirmations.consent}
                             onChange={(event) => update("confirmations", {
                               ...draft.confirmations, consent: event.target.checked,
                             })} />
                      <span>
                        <span className="font-medium">I agree to the Privacy Policy and Terms of Service.</span>
                        <span className="mt-0.5 block text-xs text-[var(--muted)]">
                          I can export or delete my data at any time.
                        </span>
                      </span>
                    </label>
                  </div>

                  <Alert tone="info" title="What happens next">
                    Your profile is saved. CareerPilot does not contact employers, submit applications or
                    publish your data. AI stays disabled until you configure a provider.
                  </Alert>
                </div>
              ) : null}
            </div>

            <div className="mt-6 flex flex-wrap items-center justify-between gap-2 border-t pt-4">
              <Button variant="outline" disabled={step === 1} onClick={() => void goTo(step - 1)}>
                <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Back
              </Button>
              <div className="flex items-center gap-2">
                <Button variant="ghost" size="sm" loading={saving} onClick={() => void saveDraft(step)}>
                  <Save className="h-3.5 w-3.5" aria-hidden="true" /> Save progress
                </Button>
                {step < 11 ? (
                  <Button loading={saving} onClick={() => void goTo(step + 1)}>
                    Continue <ArrowRight className="h-4 w-4" aria-hidden="true" />
                  </Button>
                ) : (
                  <Button loading={completing} disabled={!draft.confirmations.accuracy || !draft.confirmations.consent}
                          onClick={() => void complete()}>
                    <Sparkles className="h-4 w-4" aria-hidden="true" /> Complete onboarding
                  </Button>
                )}
              </div>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- helpers */

function ListStep<T extends object>({
  items, empty, addLabel, onChange, render,
}: {
  items: T[];
  empty: T;
  addLabel: string;
  onChange: (items: T[]) => void;
  render: (item: T, set: (patch: Partial<T>) => void) => React.ReactNode;
}) {
  const set = (index: number, patch: Partial<T>) => {
    onChange(items.map((item, itemIndex) => itemIndex === index ? { ...item, ...patch } : item));
  };
  const move = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= items.length) return;
    const next = [...items];
    [next[index], next[target]] = [next[target], next[index]];
    onChange(next);
  };
  return (
    <div className="space-y-3">
      {items.map((item, index) => {
        const record = item as Record<string, unknown>;
        return (
          <RepeatableCard
            key={index}
            title={String(record.title ?? record.name ?? record.institution ?? record.employer ?? "")}
            subtitle={String(record.employer ?? record.qualification ?? record.category ?? "")}
            index={index}
            total={items.length}
            onMoveUp={() => move(index, -1)}
            onMoveDown={() => move(index, 1)}
            onRemove={() => onChange(items.filter((_, itemIndex) => itemIndex !== index))}
          >
            {render(item, (patch) => set(index, patch))}
          </RepeatableCard>
        );
      })}
      <Button type="button" variant="outline" size="sm"
              onClick={() => onChange([...items, { ...empty }])}>
        <Plus className="h-4 w-4" aria-hidden="true" /> {addLabel}
      </Button>
      {!items.length ? (
        <p className="flex items-center gap-1 text-xs text-[var(--muted)]">
          <TriangleAlert className="h-3 w-3" aria-hidden="true" />
          No entries yet. You can skip this step and add them later.
        </p>
      ) : null}
    </div>
  );
}

function ImportSection({ label, count, onAdd }: { label: string; count: number; onAdd: () => void }) {
  return (
    <div className="flex items-center justify-between gap-2 rounded-lg border p-2.5 text-xs">
      <span>
        <span className="font-medium">{label}</span>
        <span className="text-[var(--muted)]"> · {count} found</span>
      </span>
      <Button type="button" size="sm" variant="outline" disabled={!count} onClick={onAdd}>
        <Plus className="h-3 w-3" aria-hidden="true" /> Add
      </Button>
    </div>
  );
}

function SummaryTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border p-3">
      <p className="text-xs text-[var(--muted)]">{label}</p>
      <p className="mt-0.5 text-sm font-semibold">{value}</p>
    </div>
  );
}
