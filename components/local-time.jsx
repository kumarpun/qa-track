"use client";
import { useSyncExternalStore } from "react";

const utc = (d) => new Date(d).toISOString().replace("T", " ").slice(0, 16) + " UTC";
const fmt12 = new Intl.DateTimeFormat("en-US", { year: "numeric", month: "2-digit", day: "2-digit", hour: "numeric", minute: "2-digit", hour12: true });
const local = (d) => {
  const p = Object.fromEntries(fmt12.formatToParts(new Date(d)).map((x) => [x.type, x.value]));
  return `${p.year}-${p.month}-${p.day} ${p.hour}:${p.minute} ${p.dayPeriod.toUpperCase()}`;
};
const noSubscribe = () => () => {};

/** Date in the viewer's own time zone. The server render (and first client render) shows UTC, so hydration matches. */
export function LocalTime({ value }) {
  const text = useSyncExternalStore(noSubscribe, () => local(value), () => utc(value));
  return <time dateTime={new Date(value).toISOString()}>{text}</time>;
}
