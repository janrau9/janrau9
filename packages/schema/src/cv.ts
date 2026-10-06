import { z } from "zod";
import { TAGS } from "./tags.ts";

/** `YYYY-MM`. Months only: a CV never needs days, and days invite false precision. */
export const YearMonth = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, "use YYYY-MM, e.g. 2025-08");

/** Stable, human-readable IDs. Published IDs never change; live tailored links reference them. */
const id = (prefix: string) =>
  z
    .string()
    .regex(
      new RegExp(`^${prefix}\\.[a-z0-9-]+(\\.[a-z0-9-]+)*$`),
      `must look like ${prefix}.some-name (lowercase, dots and dashes)`,
    );

const Tags = z.array(z.enum(TAGS)).min(1, "give at least one tag");

export const ProjectStatus = z.enum(["live", "in-use", "beta", "building", "archived"]);

export const Highlight = z.strictObject({
  id: z.string(),
  text: z.string().min(10).max(220),
  tags: Tags,
  projects: z.array(z.string()).optional(),
});

export const Decision = z.strictObject({
  id: z.string(),
  chose: z.string().min(3),
  over: z.string().min(3),
  because: z.string().min(10),
  tags: Tags,
});

export const Person = z.strictObject({
  name: z.string().min(1),
  location: z.string().min(1),
  workRights: z.string().min(1),
  availability: z.string().min(1),
  workPreferences: z.strictObject({
    remote: z.boolean(),
    hybrid: z.boolean(),
    relocation: z.boolean(),
  }),
  languages: z
    .array(
      z.strictObject({
        name: z.string(),
        level: z.enum(["native", "professional", "conversational", "basic"]),
      }),
    )
    .min(1),
  links: z.strictObject({
    email: z.email(),
    github: z.url(),
    linkedin: z.url(),
  }),
  about: z.string().min(20),
  aiPractice: z.string().min(20),
});

export const Headline = z.strictObject({ id: id("hl"), text: z.string().min(5).max(90) });

export const Experience = z.strictObject({
  id: id("exp"),
  org: z.string().min(1),
  role: z.string().min(1),
  location: z.string().min(1),
  start: YearMonth,
  end: YearMonth.nullable(),
  highlights: z.array(Highlight).min(1),
});

export const Education = z.strictObject({
  id: id("edu"),
  org: z.string().min(1),
  programme: z.string().min(1),
  start: YearMonth,
  end: YearMonth,
  projects: z.array(z.string()).optional(),
});

export const Award = z.strictObject({
  id: id("award"),
  text: z.string().min(10),
  project: z.string().optional(),
  tags: Tags,
});

export const Project = z.strictObject({
  id: id("proj"),
  name: z.string().min(1),
  status: ProjectStatus,
  summary: z.string().min(10).max(220),
  url: z.url().optional(),
  repo: z.union([z.literal("private"), z.url()]),
  stack: z.array(z.string()).min(1),
  featured: z.boolean().optional(),
  highlights: z.array(Highlight).optional(),
  decisions: z.array(Decision).optional(),
});

export const Skill = z.strictObject({ id: id("skill"), name: z.string().min(1), tags: Tags });

export const Cv = z.strictObject({
  person: Person,
  headlines: z.array(Headline).min(1),
  experience: z.array(Experience).min(1),
  education: z.array(Education),
  licenses: z.array(z.string()).optional(),
  awards: z.array(Award).optional(),
  projects: z.array(Project).min(1),
  skills: z.array(Skill).min(1),
});

export type Cv = z.infer<typeof Cv>;
