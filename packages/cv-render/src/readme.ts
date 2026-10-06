import type { Content } from "@janrau/schema";

/**
 * The repository README, which GitHub also shows as my profile. Generated from
 * cv.yaml so the profile never drifts from the CV.
 */
export function renderReadme({ cv, work }: Content, site: string): string {
  const { person } = cv;
  const headline = cv.headlines.find((h) => h.id === "hl.default")?.text ?? "";
  const published = new Set(work.filter((w) => !w.frontmatter.draft).map((w) => w.frontmatter.id));
  const slugs = new Map(work.map((w) => [w.frontmatter.id, w.slug]));
  const current = cv.experience.find((e) => e.end === null);

  const projectLine = (p: (typeof cv.projects)[number]) => {
    const name = published.has(p.id) ? `[${p.name}](${site}/work/${slugs.get(p.id)})` : `**${p.name}**`;
    return `- ${name}: ${p.summary}`;
  };

  const lines = [
    "<!-- Generated from content/cv.yaml by packages/cv-render. Do not edit by hand: run `pnpm render`. -->",
    "",
    `# ${person.name}`,
    "",
    `**${headline}** · ${person.location}`,
    "",
    person.about,
    "",
    person.aiPractice,
    "",
    `**[${site.replace(/^https?:\/\//, "")}](${site})** · [CV (PDF)](${site}/janrau-beray-cv.pdf) · [LinkedIn](${person.links.linkedin}) · ${person.links.email}`,
    "",
  ];

  if (current) {
    lines.push(`## Now`, "", `${current.role}, ${current.org}.`, "");
    for (const h of current.highlights.slice(0, 3)) lines.push(`- ${h.text}`);
    lines.push("");
  }

  lines.push("## Selected work", "");
  for (const p of cv.projects.filter((p) => p.featured)) lines.push(projectLine(p));
  lines.push("");

  const more = cv.projects.filter(
    (p) => !p.featured && !cv.education.some((e) => e.projects?.includes(p.id)) && p.status !== "archived",
  );
  if (more.length > 0) {
    lines.push("<details><summary>More projects</summary>", "");
    for (const p of more) lines.push(projectLine(p));
    lines.push("", "</details>", "");
  }

  lines.push(
    "## About this repository",
    "",
    `This repository is the source of [${site.replace(/^https?:\/\//, "")}](${site}). One file, \`content/cv.yaml\`, generates the website, the PDF CV and this README, and CI rejects any change that breaks the schema. Decisions are recorded in [\`content/adr/\`](content/adr/).`,
    "",
    "<sub>Set in seiza · a design language by [janrau](https://github.com/janrau9/claude-skills)</sub>",
    "",
  );
  return lines.join("\n");
}
