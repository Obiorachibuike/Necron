"use client";

import * as React from "react";
import {
  Award, BadgeCheck, Briefcase, CircleUserRound, GraduationCap, Layers, Pencil,
  Plus, ShieldQuestion, Sparkles, Trash2, Wrench,
} from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { PageHeader, Alert, Progress, Skeleton, EmptyState } from "@/components/ui/misc";
import { Button, buttonStyles } from "@/components/ui/button";
import { Badge, StatusBadge } from "@/components/ui/badge";
import { EntityDialog, type EntityField } from "@/components/entity-dialog";
import { Dialog } from "@/components/ui/dialog";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import { api, ApiError } from "@/lib/api";
import type { ProfileBundle } from "@/lib/types";
import { formatDate, humanize } from "@/lib/utils";

type Entity = Record<string, unknown> & { id: string; verified?: boolean; provenance?: string };
type SectionKey = "experiences" | "education" | "skills" | "projects" | "certifications"
  | "achievements";

type SectionConfig = {
  key: SectionKey;
  title: string;
  description: string;
  endpoint: string;
  singular: string;
  icon: React.ElementType;
  fields: EntityField[];
  defaults: Record<string, unknown>;
  titleOf: (item: Entity) => string;
  subtitleOf: (item: Entity) => string;
  metaOf: (item: Entity) => string;
};

const EXPERIENCE_FIELDS: EntityField[] = [
  { key: "employer", label: "Employer", required: true },
  { key: "title", label: "Job title", required: true },
  { key: "employment_type", label: "Employment type", type: "select", options: [
    ["full_time", "Full-time"], ["part_time", "Part-time"], ["contract", "Contract"],
    ["internship", "Internship"], ["freelance", "Freelance"], ["temporary", "Temporary"],
  ] },
  { key: "location", label: "Location" },
  { key: "start_date", label: "Start date", type: "date" },
  { key: "end_date", label: "End date", type: "date" },
  { key: "is_current", label: "Current role", type: "checkbox", placeholder: "I currently work here" },
  { key: "is_remote", label: "Remote", type: "checkbox", placeholder: "Remote role" },
  { key: "description", label: "Description", type: "textarea", full: true },
  { key: "achievements", label: "Achievements", type: "list", full: true,
    help: "One per line or comma separated. Only include supportable numbers." },
  { key: "tools", label: "Tools and technologies", type: "list", full: true },
  { key: "leadership", label: "Leadership", type: "textarea", full: true },
  { key: "metrics", label: "Metrics", type: "list", full: true,
    help: "Only metrics you can evidence." },
  { key: "provenance", label: "Provenance", type: "select", options: [
    ["user_confirmed", "User confirmed"], ["imported_unconfirmed", "Imported"],
    ["document_extracted", "Document extracted"], ["ai_suggested", "AI suggested"],
    ["unverified", "Unverified"], ["outdated", "Outdated"],
  ] },
];

const EDUCATION_FIELDS: EntityField[] = [
  { key: "institution", label: "Institution", required: true },
  { key: "qualification", label: "Qualification" },
  { key: "field_of_study", label: "Field of study" },
  { key: "location", label: "Location" },
  { key: "start_date", label: "Start date", type: "date" },
  { key: "end_date", label: "End date", type: "date" },
  { key: "status", label: "Status", type: "select", options: [
    ["completed", "Completed"], ["in_progress", "In progress"], ["incomplete", "Incomplete"],
  ] },
  { key: "coursework", label: "Relevant coursework", full: true },
  { key: "achievements", label: "Achievements", type: "list", full: true },
  { key: "notes", label: "Notes", type: "textarea", full: true },
];

const SKILL_FIELDS: EntityField[] = [
  { key: "name", label: "Skill", required: true },
  { key: "category", label: "Category" },
  { key: "proficiency", label: "Proficiency", type: "select", options: [
    ["beginner", "Beginner"], ["intermediate", "Intermediate"], ["advanced", "Advanced"],
    ["expert", "Expert"], ["unspecified", "Unspecified"],
  ] },
  { key: "years_experience", label: "Years", type: "number", min: 0, max: 60, step: 0.5 },
  { key: "last_used", label: "Last used", type: "date" },
  { key: "evidence", label: "Evidence", full: true,
    help: "Required for expert proficiency." },
  { key: "supporting_projects", label: "Supporting projects", type: "list", full: true },
];

const PROJECT_FIELDS: EntityField[] = [
  { key: "name", label: "Project name", required: true },
  { key: "technologies", label: "Technologies", type: "list" },
  { key: "description", label: "Description", type: "textarea", full: true },
  { key: "problem_solved", label: "Problem solved", type: "textarea", full: true },
  { key: "responsibilities", label: "Responsibilities", type: "textarea", full: true },
  { key: "outcomes", label: "Outcomes", type: "textarea", full: true },
  { key: "repo_url", label: "Repository URL" },
  { key: "demo_url", label: "Demo URL" },
  { key: "visibility", label: "Visibility", type: "select", options: [
    ["public", "Public"], ["private", "Private"], ["confidential", "Confidential"],
  ] },
  { key: "start_date", label: "Start date", type: "date" },
  { key: "end_date", label: "End date", type: "date" },
];

const CERTIFICATION_FIELDS: EntityField[] = [
  { key: "name", label: "Certification", required: true },
  { key: "issuer", label: "Issuer" },
  { key: "issue_date", label: "Issue date", type: "date" },
  { key: "expiry_date", label: "Expiry date", type: "date" },
  { key: "credential_url", label: "Credential URL", full: true },
  { key: "notes", label: "Notes", type: "textarea", full: true },
];

const ACHIEVEMENT_FIELDS: EntityField[] = [
  { key: "title", label: "Title", required: true },
  { key: "category", label: "Category", type: "select", options: [
    ["award", "Award"], ["recognition", "Recognition"], ["publication", "Publication"],
    ["speaking", "Speaking"], ["community", "Community"], ["other", "Other"],
  ] },
  { key: "description", label: "Description", type: "textarea", full: true },
  { key: "date", label: "Date", type: "date" },
  { key: "evidence_url", label: "Evidence URL", full: true },
];

const SECTIONS: SectionConfig[] = [
  {
    key: "experiences", title: "Work experience", endpoint: "/profile/experiences",
    description: "Roles that form the backbone of your CV.",
    singular: "experience", icon: Briefcase, fields: EXPERIENCE_FIELDS,
    defaults: { employment_type: "full_time", is_current: false, is_remote: false },
    titleOf: (item) => `${String(item.title)} · ${String(item.employer)}`,
    subtitleOf: (item) => [
      item.is_current ? "Current" : item.end_date ? `Ended ${formatDate(String(item.end_date))}` : "",
      String(item.location ?? ""),
    ].filter(Boolean).join(" · "),
    metaOf: (item) => Array.isArray(item.achievements) && item.achievements.length
      ? `${item.achievements.length} achievement bullet(s)` : "No achievements yet",
  },
  {
    key: "education", title: "Education", endpoint: "/profile/education",
    description: "Degrees, diplomas and formal study.",
    singular: "education record", icon: GraduationCap, fields: EDUCATION_FIELDS,
    defaults: { status: "completed" },
    titleOf: (item) => `${String(item.qualification || "Study")} · ${String(item.institution)}`,
    subtitleOf: (item) => [item.status, item.field_of_study].filter(Boolean).join(" · "),
    metaOf: (item) => item.end_date ? `Ended ${formatDate(String(item.end_date))}` : "",
  },
  {
    key: "skills", title: "Skills", endpoint: "/profile/skills",
    description: "Verified skills are used in matching and documents.",
    singular: "skill", icon: Wrench, fields: SKILL_FIELDS,
    defaults: { category: "General", proficiency: "intermediate", verified: true },
    titleOf: (item) => String(item.name),
    subtitleOf: (item) => [item.category, item.proficiency].filter(Boolean).join(" · "),
    metaOf: (item) => item.years_experience ? `${item.years_experience} year(s)` : "",
  },
  {
    key: "projects", title: "Projects", endpoint: "/profile/projects",
    description: "Evidence of applied skill, not a portfolio dump.",
    singular: "project", icon: Layers, fields: PROJECT_FIELDS,
    defaults: { visibility: "public" },
    titleOf: (item) => String(item.name),
    subtitleOf: (item) => Array.isArray(item.technologies) ? item.technologies.join(", ") : "",
    metaOf: (item) => String(item.outcomes ?? ""),
  },
  {
    key: "certifications", title: "Certifications", endpoint: "/profile/certifications",
    description: "Credentials with a real issuer and date.",
    singular: "certification", icon: Award, fields: CERTIFICATION_FIELDS,
    defaults: {},
    titleOf: (item) => String(item.name),
    subtitleOf: (item) => [item.issuer, item.issue_date ? formatDate(String(item.issue_date)) : ""]
      .filter(Boolean).join(" · "),
    metaOf: (item) => item.credential_url ? "Credential link added" : "",
  },
  {
    key: "achievements", title: "Achievements", endpoint: "/profile/achievements",
    description: "Awards, publications and recognition.",
    singular: "achievement", icon: Sparkles, fields: ACHIEVEMENT_FIELDS,
    defaults: { category: "award" },
    titleOf: (item) => String(item.title),
    subtitleOf: (item) => [item.category, item.date ? formatDate(String(item.date)) : ""]
      .filter(Boolean).join(" · "),
    metaOf: (item) => String(item.description ?? ""),
  },
];

export default function ProfilePage() {
  const client = useQueryClient();
  const { toast } = useToast();
  const [editingProfile, setEditingProfile] = React.useState(false);
  const [editingPreferences, setEditingPreferences] = React.useState(false);
  const [editingStyle, setEditingStyle] = React.useState(false);
  const [dialog, setDialog] = React.useState<{ section: SectionConfig; item: Entity | null } | null>(null);
  const [busy, setBusy] = React.useState("");

  const { data, isLoading, error } = useQuery({
    queryKey: ["profile"],
    queryFn: () => api.get<ProfileBundle>("/profile"),
  });

  const invalidate = async () => {
    await client.invalidateQueries({ queryKey: ["profile"] });
    await client.invalidateQueries({ queryKey: ["dashboard"] });
  };

  const saveProfile = async (values: Record<string, unknown>) => {
    try {
      await api.patch("/profile", values);
      await invalidate();
      toast({ title: "Profile updated", tone: "success" });
    } catch (caught) {
      throw new Error(caught instanceof ApiError ? caught.message : "Could not update the profile.");
    }
  };

  const saveEntity = async (values: Record<string, unknown>) => {
    if (!dialog) return;
    const payload = {
      ...values,
      verified: dialog.item?.verified ?? true,
      provenance: dialog.item?.provenance ?? "user_confirmed",
    };
    try {
      if (dialog.item) {
        await api.put(`${dialog.section.endpoint}/${dialog.item.id}`, payload);
      } else {
        await api.post(dialog.section.endpoint, payload);
      }
      await invalidate();
      toast({ title: `${humanize(dialog.section.singular)} saved`, tone: "success" });
    } catch (caught) {
      throw new Error(caught instanceof ApiError ? caught.message : "Could not save this entry.");
    }
  };

  const removeEntity = async (section: SectionConfig, item: Entity) => {
    if (!window.confirm(`Delete “${section.titleOf(item)}”? This cannot be undone.`)) return;
    setBusy(item.id);
    try {
      await api.del(`${section.endpoint}/${item.id}`);
      await invalidate();
      toast({ title: `${humanize(section.singular)} deleted`, tone: "success" });
    } catch (caught) {
      toast({ title: "Could not delete entry", description: caught instanceof ApiError ? caught.message : undefined, tone: "error" });
    } finally {
      setBusy("");
    }
  };

  const ENTITY_TYPES: Record<SectionKey, string> = {
    experiences: "experience", education: "education", skills: "skill",
    projects: "project", certifications: "certification", achievements: "achievement",
  };

  const verifyEntity = async (section: SectionConfig, item: Entity) => {
    setBusy(item.id);
    try {
      await api.post("/profile/verify", {
        entity_type: ENTITY_TYPES[section.key],
        entity_ids: [item.id],
        verified: !item.verified,
      });
      await invalidate();
    } catch (caught) {
      toast({ title: "Could not update verification", description: caught instanceof ApiError ? caught.message : undefined, tone: "error" });
    } finally {
      setBusy("");
    }
  };

  if (isLoading) {
    return <div className="space-y-4"><Skeleton className="h-24" /><Skeleton className="h-64" /><Skeleton className="h-64" /></div>;
  }
  if (error || !data) {
    return <Alert tone="danger" title="Profile unavailable">Could not load your career profile.</Alert>;
  }

  const profile = data.profile;
  const prefs = data.preferences;
  const style = data.writing_style;

  return (
    <div>
      <PageHeader
        eyebrow="Career knowledge base"
        title="Career profile"
        description="Every document and match is built from these records. Keep provenance and verification honest."
        actions={
          <Button size="sm" onClick={() => setEditingProfile(true)}>
            <Pencil className="h-4 w-4" aria-hidden="true" /> Edit profile
          </Button>
        }
      />

      <div className="grid gap-4 lg:grid-cols-[1.4fr_0.6fr]">
        <div className="cp-card p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-lg font-semibold">
                {profile?.preferred_name || "Your name"}
              </p>
              <p className="text-sm text-[var(--muted)]">
                {profile?.professional_headline || "Add a professional headline"}
              </p>
              <p className="mt-2 max-w-2xl text-sm text-[var(--muted)]">
                {profile?.summary || "Add a short summary in your own words."}
              </p>
            </div>
            <div className="w-full max-w-[220px]">
              <Progress value={data.completeness} label="Profile completeness" />
            </div>
          </div>
          <div className="mt-4 flex flex-wrap gap-2 text-xs text-[var(--muted)]">
            {profile?.city || profile?.country ? (
              <Badge>{[profile?.city, profile?.country].filter(Boolean).join(", ")}</Badge>
            ) : null}
            {profile?.phone ? <Badge>{profile.phone}</Badge> : null}
            {profile?.career_objectives?.map((objective) => (
              <Badge key={objective}>{humanize(objective)}</Badge>
            ))}
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={() => setEditingProfile(true)}>
              <CircleUserRound className="h-3.5 w-3.5" aria-hidden="true" /> Identity and links
            </Button>
            <Button variant="outline" size="sm" onClick={() => setEditingPreferences(true)}>
              Job preferences
            </Button>
            <Button variant="outline" size="sm" onClick={() => setEditingStyle(true)}>
              Writing style
            </Button>
          </div>
        </div>

        <div className="cp-card p-5">
          <h2 className="text-sm font-semibold">Missing information</h2>
          {data.missing.length ? (
            <ul className="mt-2 space-y-1.5 text-sm text-[var(--muted)]">
              {data.missing.slice(0, 8).map((item) => (
                <li key={item} className="flex items-start gap-2">
                  <ShieldQuestion className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--warning)]" aria-hidden="true" />
                  {item}
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 flex items-center gap-2 text-sm text-[var(--success)]">
              <BadgeCheck className="h-4 w-4" aria-hidden="true" /> No required fields missing.
            </p>
          )}
          {Object.values(data.unverified_counts ?? {}).some((count) => count > 0) ? (
            <p className="mt-3 text-xs text-[var(--warning)]">
              Unverified records: {Object.entries(data.unverified_counts)
                .filter(([, count]) => count > 0)
                .map(([key, count]) => `${key} ${count}`).join(", ")}
            </p>
          ) : null}
        </div>
      </div>

      <div className="mt-6 space-y-5">
        {SECTIONS.map((section) => {
          const items = (data[section.key] as Entity[]) ?? [];
          const Icon = section.icon;
          return (
            <section key={section.key} className="cp-card p-5" id={section.key}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="flex items-center gap-2 text-base font-semibold">
                    <Icon className="h-4 w-4 text-[var(--brand)]" aria-hidden="true" />
                    {section.title}
                    <span className="text-xs font-normal text-[var(--muted)]">({items.length})</span>
                  </h2>
                  <p className="mt-1 text-sm text-[var(--muted)]">{section.description}</p>
                </div>
                <Button variant="outline" size="sm"
                        onClick={() => setDialog({ section, item: null })}>
                  <Plus className="h-3.5 w-3.5" aria-hidden="true" /> Add {section.singular}
                </Button>
              </div>

              {items.length ? (
                <ul className="mt-4 space-y-2">
                  {items.map((item) => (
                    <li key={item.id} className="rounded-xl border p-3">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium">{section.titleOf(item)}</p>
                          {section.subtitleOf(item) ? (
                            <p className="text-xs text-[var(--muted)]">{section.subtitleOf(item)}</p>
                          ) : null}
                          {section.metaOf(item) ? (
                            <p className="mt-1 line-clamp-2 text-xs text-[var(--muted)]">{section.metaOf(item)}</p>
                          ) : null}
                        </div>
                        <div className="flex shrink-0 flex-wrap items-center gap-1.5">
                          <StatusBadge status={item.verified ? "approved" : "warning"}
                                        label={item.verified ? "Verified" : "Unverified"} />
                          <Badge>{(item.provenance ?? "user_confirmed").replace(/_/g, " ")}</Badge>
                          <Button variant="ghost" size="sm" aria-label={`Edit ${section.titleOf(item)}`}
                                  onClick={() => setDialog({ section, item })}>
                            <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
                          </Button>
                          <Button variant="ghost" size="sm" loading={busy === item.id}
                                  aria-label={`${item.verified ? "Unverify" : "Verify"} ${section.titleOf(item)}`}
                                  onClick={() => void verifyEntity(section, item)}>
                            <BadgeCheck className="h-3.5 w-3.5" aria-hidden="true" />
                          </Button>
                          <Button variant="ghost" size="sm" loading={busy === item.id}
                                  aria-label={`Delete ${section.titleOf(item)}`}
                                  onClick={() => void removeEntity(section, item)}>
                            <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                          </Button>
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              ) : (
                <div className="mt-4">
                  <EmptyState icon={Icon} title={`No ${section.title.toLowerCase()} yet`}
                              description={`Add your first ${section.singular}.`} />
                </div>
              )}
            </section>
          );
        })}
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <section className="cp-card p-5">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold">Job preferences</h2>
            <Button variant="outline" size="sm" onClick={() => setEditingPreferences(true)}>Edit</Button>
          </div>
          {prefs ? (
            <dl className="mt-3 grid grid-cols-2 gap-2 text-sm">
              <Preference label="Titles" value={prefs.desired_titles?.join(", ")} />
              <Preference label="Industries" value={prefs.industries?.join(", ")} />
              <Preference label="Countries" value={prefs.countries?.join(", ")} />
              <Preference label="Arrangements" value={prefs.work_arrangements?.join(", ")} />
              <Preference label="Employment" value={prefs.employment_types?.join(", ")} />
              <Preference label="Salary" value={
                prefs.salary_min || prefs.salary_max
                  ? `${prefs.currency} ${prefs.salary_min ?? "—"}–${prefs.salary_max ?? "—"} / ${prefs.salary_period}`
                  : "Not set"
              } />
              <Preference label="Relocation" value={prefs.relocation} />
              <Preference label="Authorization" value={prefs.work_authorization || "Not set"} />
            </dl>
          ) : <p className="mt-2 text-sm text-[var(--muted)]">No preferences saved yet.</p>}
        </section>
        <section className="cp-card p-5">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold">Writing style</h2>
            <Button variant="outline" size="sm" onClick={() => setEditingStyle(true)}>Edit</Button>
          </div>
          {style ? (
            <dl className="mt-3 grid grid-cols-2 gap-2 text-sm">
              <Preference label="Tone" value={style.tone} />
              <Preference label="Length" value={style.length_preference} />
              <Preference label="Confidence" value={style.confidence} />
              <Preference label="Technicality" value={style.technicality} />
              <Preference label="Directness" value={style.directness} />
              <Preference label="CV style" value={style.cv_style} />
              <Preference label="Avoid" value={style.avoid_words?.join(", ") || "Nothing listed"} />
              <Preference label="Samples" value={style.sample_permission ? "Allowed for style only" : "Not provided"} />
            </dl>
          ) : <p className="mt-2 text-sm text-[var(--muted)]">No writing style saved yet.</p>}
        </section>
      </div>

      <EntityDialog
        open={editingProfile}
        onClose={() => setEditingProfile(false)}
        title="Edit profile"
        description="Profile fields are yours to correct. Do not add claims you cannot support."
        fields={[
          { key: "preferred_name", label: "Preferred name" },
          { key: "professional_headline", label: "Professional headline" },
          { key: "summary", label: "Summary", type: "textarea", full: true },
          { key: "phone", label: "Phone" },
          { key: "city", label: "City" },
          { key: "country", label: "Country" },
          { key: "work_locations", label: "Work locations", type: "list", full: true },
          { key: "portfolio_url", label: "Portfolio URL" },
          { key: "github_url", label: "GitHub URL" },
          { key: "linkedin_url", label: "LinkedIn URL" },
          { key: "website_url", label: "Website URL" },
          { key: "career_objectives", label: "Career objectives", type: "list", full: true,
            help: "full_time, remote_work, internship, graduate, contract, freelance, career_change, application_improvement, interview_preparation, exploration" },
          { key: "include_phone_in_documents", label: "Show phone on documents", type: "checkbox" },
          { key: "include_location_in_documents", label: "Show location on documents", type: "checkbox" },
        ]}
        initial={profile ? { ...profile } : {}}
        onSubmit={saveProfile}
      />

      <EntityDialog
        open={editingPreferences}
        onClose={() => setEditingPreferences(false)}
        title="Job preferences"
        fields={[
          { key: "desired_titles", label: "Target titles", type: "list", full: true },
          { key: "industries", label: "Industries", type: "list" },
          { key: "countries", label: "Countries / locations", type: "list" },
          { key: "work_arrangements", label: "Work arrangements", type: "list",
            help: "remote, hybrid, onsite" },
          { key: "employment_types", label: "Employment types", type: "list" },
          { key: "experience_level", label: "Experience level", type: "select", options: [
            ["", "No preference"], ["entry", "Entry"], ["mid", "Mid"], ["senior", "Senior"],
            ["lead", "Lead"], ["executive", "Executive"],
          ] },
          { key: "salary_min", label: "Salary minimum", type: "number", min: 0 },
          { key: "salary_max", label: "Salary maximum", type: "number", min: 0 },
          { key: "currency", label: "Currency" },
          { key: "salary_period", label: "Salary period", type: "select", options: [
            ["annual", "Annual"], ["monthly", "Monthly"], ["daily", "Daily"], ["hourly", "Hourly"],
          ] },
          { key: "relocation", label: "Relocation", type: "select", options: [
            ["yes", "Yes"], ["maybe", "Maybe"], ["no", "No"],
          ] },
          { key: "preferred_technologies", label: "Preferred technologies", type: "list", full: true },
          { key: "work_authorization", label: "Work authorization", full: true },
          { key: "notes", label: "Notes", type: "textarea", full: true },
        ]}
        initial={prefs ? { ...prefs } : { currency: "USD", salary_period: "annual", relocation: "maybe" }}
        onSubmit={async (values) => {
          try {
            await api.put("/profile/preferences", values);
            await invalidate();
            toast({ title: "Preferences saved", tone: "success" });
          } catch (caught) {
            throw new Error(caught instanceof ApiError ? caught.message : "Could not save preferences.");
          }
        }}
      />

      <EntityDialog
        open={editingStyle}
        onClose={() => setEditingStyle(false)}
        title="Writing style"
        description="Style affects language only. It never changes facts or scores."
        fields={[
          { key: "tone", label: "Tone", type: "select", options: [
            ["professional", "Professional"], ["conversational", "Conversational"],
            ["formal", "Formal"],
          ] },
          { key: "length_preference", label: "Length", type: "select", options: [
            ["concise", "Concise"], ["balanced", "Balanced"], ["detailed", "Detailed"],
          ] },
          { key: "confidence", label: "Confidence", type: "select", options: [
            ["confident", "Confident"], ["understated", "Understated"],
          ] },
          { key: "technicality", label: "Technicality", type: "select", options: [
            ["technical", "Technical"], ["accessible", "Accessible"],
          ] },
          { key: "directness", label: "Directness", type: "select", options: [
            ["direct", "Direct"], ["diplomatic", "Diplomatic"],
          ] },
          { key: "cv_style", label: "Default CV template", type: "select", options: [
            ["ats", "ATS"], ["modern_developer", "Modern developer"],
            ["fullstack_engineer", "Full-stack"], ["backend_engineer", "Backend"],
            ["ai_engineer", "AI"], ["mobile_developer", "Mobile"], ["graduate", "Graduate"],
            ["academic", "Academic"],
          ] },
          { key: "cover_letter_length", label: "Cover letter length", type: "select", options: [
            ["concise", "Concise"], ["standard", "Standard"], ["detailed", "Detailed"],
          ] },
          { key: "avoid_words", label: "Avoid words", type: "list", full: true },
          { key: "writing_samples", label: "Writing samples", type: "textarea", full: true,
            help: "Optional. Used only for style if you grant permission." },
          { key: "sample_permission", label: "Use samples for style", type: "checkbox",
            placeholder: "I allow samples to inform style (never facts)" },
        ]}
        initial={style ? { ...style } : {
          tone: "professional", length_preference: "balanced", confidence: "confident",
          technicality: "technical", directness: "direct", cv_style: "ats",
          cover_letter_length: "standard", sample_permission: false,
        }}
        onSubmit={async (values) => {
          try {
            await api.put("/profile/writing-style", values);
            await invalidate();
            toast({ title: "Writing style saved", tone: "success" });
          } catch (caught) {
            throw new Error(caught instanceof ApiError ? caught.message : "Could not save writing style.");
          }
        }}
      />

      <EntityDialog
        open={Boolean(dialog)}
        onClose={() => setDialog(null)}
        title={dialog ? `${dialog.item ? "Edit" : "Add"} ${dialog.section.singular}` : "Entry"}
        description="Provenance and verification are visible to you and enforced by the document builder."
        fields={dialog?.section.fields ?? []}
        initial={dialog ? { ...dialog.section.defaults, ...(dialog.item ?? {}) } : {}}
        onSubmit={saveEntity}
      />
    </div>
  );
}

function Preference({ label, value }: { label: string; value?: string | null }) {
  return (
    <div>
      <dt className="text-xs text-[var(--muted)]">{label}</dt>
      <dd className="truncate text-sm">{value || "—"}</dd>
    </div>
  );
}
