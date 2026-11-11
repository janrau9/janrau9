import { expect, test } from "@playwright/test";
import { eventDetail } from "../src/lib/beacon";
import { commentMail, parseComment, replyAddress } from "../src/lib/comments";
import { digest, readerKind, secondsRead, type Visit } from "../src/lib/digest";
import { deviceClass, readerKey } from "../src/lib/events";
import { reminderMail } from "../src/lib/reminder-mail";

// Pure logic behind the visit digests, the reminder emails and comments: no server needed.

const visit = (over: Partial<Visit> = {}): Visit => ({
  visit: "v1",
  slug: "acme-events-t3st1",
  company: "Acme Events",
  role: "Software Engineer",
  events: [
    { type: "human", ts: 1000, detail: null, reader: "desktop:aaaa1111" },
    { type: "fit_viewed", ts: 1010, detail: null, reader: null },
    { type: "case_click", ts: 1100, detail: "kiln", reader: null },
    { type: "elevator", ts: 1200, detail: "kubernetes go", reader: null },
    { type: "elevator", ts: 1250, detail: "typescript", reader: null },
    { type: "cv_download", ts: 1300, detail: null, reader: null },
    { type: "visit_end", ts: 1400, detail: "372", reader: null },
  ],
  earlierReaders: [],
  readBefore: false,
  ...over,
});

test.describe("visit digest", () => {
  test("says what the visit did, in order, with the case study's title and the terms' names", () => {
    const { subject, text } = digest(visit());
    expect(subject).toBe("Acme Events: read, CV downloaded");
    expect(text).toContain("The first person to read it.");
    expect(text).toContain("Read for 6 min.");
    expect(text).toContain("Viewed the fit table.");
    expect(text).toContain("Opened the case study: kiln.");
    expect(text).toContain("Asked elevator mode about Kubernetes, Go and TypeScript.");
    expect(text).toContain("Downloaded the CV.");
  });

  test("turns the tech they asked about that I don't have into prep notes, with the closest work", () => {
    const { text } = digest(visit());
    expect(text).toContain("They asked about something you don't have. Be ready:");
    expect(text).toMatch(/- Kubernetes: not in my work yet\. Closest: Docker.*\./);
    expect(text).toMatch(/- Go: not in my work yet\. Closest: TypeScript and C\./);
    expect(text).not.toContain("- TypeScript:");
  });

  test("a reader on another device or network than before is new: the link was probably shared", () => {
    const shared = visit({ readBefore: true, earlierReaders: ["phone:bbbb2222"] });
    expect(readerKind(shared)).toBe("new");
    expect(digest(shared).subject).toBe("Acme Events: a new reader (probably shared)");
    expect(digest(shared).text).toContain("probably shared");
  });

  test("the same device and network is a returning reader; reads from before reader keys are unknown", () => {
    expect(readerKind(visit({ readBefore: true, earlierReaders: ["desktop:aaaa1111"] }))).toBe("returning");
    const unknown = visit({ readBefore: true, earlierReaders: [] });
    expect(readerKind(unknown)).toBe("unknown");
    expect(digest(unknown).text).toContain("whether by the same person is unknown");
  });

  test("time read is what the page reported, else first event to last", () => {
    expect(secondsRead(visit().events)).toBe(372);
    expect(secondsRead(visit().events.filter((e) => e.type !== "visit_end"))).toBe(300);
  });
});

test.describe("beacon details", () => {
  test("keep a case study slug, known term ids and sane seconds; drop anything else", () => {
    expect(eventDetail("case_click", { case: "kiln" })).toBe("kiln");
    expect(eventDetail("case_click", { case: "../admin" })).toBeNull();
    expect(eventDetail("elevator", { terms: ["go", "made-up", "kubernetes"] })).toBe("go kubernetes");
    expect(eventDetail("elevator", { terms: ["made-up"] })).toBeNull();
    expect(eventDetail("visit_end", { seconds: 95.4 })).toBe("95");
    expect(eventDetail("visit_end", { seconds: 999_999 })).toBeNull();
    expect(eventDetail("human", { case: "kiln" })).toBeNull();
  });

  test("a reader is only a device class and a short hash of the network, different on every link", async () => {
    const phone = "Mozilla/5.0 (Linux; Android 14; Pixel 8) Mobile Safari/537.36";
    expect(deviceClass(phone)).toBe("phone");
    expect(deviceClass("Mozilla/5.0 (iPad; CPU OS 18_0)")).toBe("tablet");
    expect(deviceClass("Mozilla/5.0 (Windows NT 10.0; Win64; x64)")).toBe("desktop");
    const a = await readerKey("acme-events-t3st1", 1759, phone);
    expect(a).toMatch(/^phone:[0-9a-f]{8}$/);
    expect(await readerKey("acme-events-t3st1", 1759, phone)).toBe(a);
    expect(await readerKey("other-co-abcde", 1759, phone)).not.toBe(a);
  });
});

test.describe("comments", () => {
  test("need a message, stay within limits, and quietly drop the honeypot", () => {
    expect(parseComment({ message: "  How big is the team?  ", contact: "" })).toEqual({
      ok: true,
      comment: { message: "How big is the team?", contact: null },
    });
    expect(parseComment({ message: "   " })).toEqual({ ok: false, reason: "empty" });
    expect(parseComment({ message: "x".repeat(2001) })).toEqual({ ok: false, reason: "too-long" });
    expect(parseComment({ message: "hi", website: "http://spam" })).toEqual({ ok: false, reason: "bot" });
  });

  test("reply to an email address directly; any other contact is shown, not replied to", () => {
    expect(replyAddress("recruiter@acme.example")).toBe("recruiter@acme.example");
    expect(replyAddress("call me on Teams")).toBeUndefined();
    const app = { company: "Acme Events", role: "Software Engineer" };
    const withEmail = commentMail(app, "acme-events-t3st1", { message: "Hi", contact: "r@acme.example" });
    expect(withEmail.replyTo).toBe("r@acme.example");
    expect(withEmail.text).toContain("Reply to this email to answer them.");
    expect(commentMail(app, "acme-events-t3st1", { message: "Hi", contact: null }).text).toContain("no way to reply");
  });
});

test("reminder emails list each application with its dashboard advice", () => {
  const one = reminderMail([
    { slug: "acme-events-t3st1", company: "Acme Events", kind: "follow-up", days: 8, text: "Follow up." },
  ]);
  expect(one.subject).toBe("Follow-up: Acme Events");
  expect(one.text).toContain("Acme Events: Follow up.");
  const two = reminderMail([
    { slug: "a-co-aaaaa", company: "A", kind: "unread", days: 11, text: "x" },
    { slug: "b-co-bbbbb", company: "B", kind: "no-reply", days: 22, text: "y" },
  ]);
  expect(two.subject).toBe("Follow-ups: 2 applications");
});
