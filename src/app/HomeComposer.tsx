"use client";

import { useState } from "react";
import { ArrowRight } from "lucide-react";

/**
 * The main event on the home page: describe it, pick where, Continue.
 * It's a plain GET form to /report (works without JS). As you type, the
 * ruled underline goes navy and Continue wakes up from its quiet state.
 */
export function HomeComposer({ places }: { places: { value: string; label: string; detail: string }[] }) {
  const [text, setText] = useState("");
  const awake = text.trim().length > 0;
  return (
    <form action="/report" method="get" className="mt-8">
      <label htmlFor="home-desc" className="sr-only">
        Describe the problem
      </label>
      <div className="group relative">
        <textarea
          id="home-desc"
          name="desc"
          rows={3}
          maxLength={2000}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="The shower in the 2nd floor bathroom has no hot water…"
          className="block w-full resize-none border-0 border-b-2 border-line-2 bg-transparent px-0 pb-4 pt-1 text-[1.375rem] leading-[1.45] text-ink outline-none transition-colors placeholder:text-[#6c788c] hover:border-[#aab3c0] focus-visible:shadow-none md:text-[1.625rem]"
        />
        {/* The underline that draws across on focus. */}
        <span aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 h-[3px] origin-left scale-x-0 bg-navy transition-transform duration-300 ease-out group-focus-within:scale-x-100" />
      </div>

      <div className="mt-5 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <fieldset className="min-w-0">
          <legend className="wo-label mb-2">Where is it?</legend>
          <div className="flex flex-wrap gap-2">
            {places.map((p, i) => (
              <label
                key={p.value}
                className="relative flex cursor-pointer items-center rounded-[4px] border-2 border-navy/25 px-3.5 py-2 text-[0.9375rem] font-bold text-navy transition-colors hover:border-navy has-[:checked]:border-navy has-[:checked]:bg-navy has-[:checked]:text-white has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-navy"
              >
                <input type="radio" name="where" value={p.value} defaultChecked={i === 0} className="sr-only" />
                {p.label}
                <span className="sr-only">: {p.detail}</span>
              </label>
            ))}
          </div>
        </fieldset>
        <button
          type="submit"
          className={`btn shrink-0 !min-h-13 px-6 text-[1.125rem] transition-[background-color,color,transform] duration-200 ${awake ? "btn-accent" : "bg-buzz-50 text-gold-ink hover:bg-buzz/60"}`}
        >
          Continue
          <ArrowRight aria-hidden className={`size-5 transition-transform duration-200 ${awake ? "translate-x-0.5" : ""}`} />
        </button>
      </div>
    </form>
  );
}
