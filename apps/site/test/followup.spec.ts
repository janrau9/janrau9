import { expect, test } from "@playwright/test";
import { type FollowUpInput, reminders } from "../src/lib/followup";

const DAY = 86400;
const NOW = 100 * DAY;
const app = (o: Partial<FollowUpInput>): FollowUpInput => ({
  slug: "co-abcde",
  company: "Co",
  status: "applied",
  published_at: NOW - 2 * DAY,
  first_human: null,
  followed_up_at: null,
  ...o,
});
const kinds = (o: Partial<FollowUpInput>) => reminders([app(o)], NOW).map((r) => r.kind);

test("read by a person a week ago, no reply: follow up", () => {
  expect(kinds({ published_at: NOW - 9 * DAY, first_human: NOW - 7 * DAY })).toEqual(["follow-up"]);
  expect(kinds({ published_at: NOW - 9 * DAY, first_human: NOW - 6 * DAY })).toEqual([]);
});

test("published 10 days ago and never read by a person: try another channel", () => {
  expect(kinds({ published_at: NOW - 10 * DAY })).toEqual(["unread"]);
  expect(kinds({ published_at: NOW - 9 * DAY })).toEqual([]);
});

test("three quiet weeks after publishing or the last follow-up: suggest no reply", () => {
  expect(kinds({ published_at: NOW - 21 * DAY, first_human: NOW - 20 * DAY })).toEqual(["no-reply"]);
  expect(kinds({ published_at: NOW - 30 * DAY, followed_up_at: NOW - 21 * DAY })).toEqual(["no-reply"]);
});

test("a follow-up silences the reminders until the no-reply clock runs out", () => {
  expect(kinds({ published_at: NOW - 15 * DAY, first_human: NOW - 14 * DAY, followed_up_at: NOW - 3 * DAY })).toEqual(
    [],
  );
});

test("only sent applications get reminders", () => {
  for (const status of ["draft", "interview", "rejected", "offer", "no_reply", "withdrawn"])
    expect(kinds({ status, published_at: NOW - 40 * DAY })).toEqual([]);
  expect(kinds({ published_at: null })).toEqual([]);
});

test("the longest-waiting application comes first", () => {
  const r = reminders(
    [app({ slug: "a-aaaaa", published_at: NOW - 12 * DAY }), app({ slug: "b-bbbbb", published_at: NOW - 25 * DAY })],
    NOW,
  );
  expect(r.map((x) => x.slug)).toEqual(["b-bbbbb", "a-aaaaa"]);
});
