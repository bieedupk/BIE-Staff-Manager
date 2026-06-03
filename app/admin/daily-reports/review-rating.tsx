"use client";

import { useState } from "react";
import { Star } from "lucide-react";

const ratingLabels = ["Poor", "Needs Improvement", "Average", "Good", "Excellent"];

export function ReviewRating({ initialRating }: { initialRating: number | null }) {
  const [rating, setRating] = useState(initialRating ?? 0);

  return (
    <fieldset className="grid gap-2">
      <legend className="text-sm font-extrabold text-slate-950">Rating</legend>
      <input type="hidden" name="review_rating" value={rating || ""} readOnly />
      <div className="flex flex-wrap items-center gap-2">
        <div className="inline-flex items-center rounded-lg border border-amber-200 bg-amber-50 px-2 py-1">
          {[1, 2, 3, 4, 5].map((star) => (
            <button
              key={star}
              type="button"
              onClick={() => setRating(star)}
              className="grid size-10 place-items-center text-amber-500 transition hover:text-amber-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-500"
              aria-label={`${star} stars: ${ratingLabels[star - 1]}`}
              aria-pressed={rating === star}
            >
              <Star className={`h-7 w-7 ${star <= rating ? "fill-current" : ""}`} aria-hidden="true" />
            </button>
          ))}
        </div>
        <p className="text-sm font-bold text-slate-600">{rating ? ratingLabels[rating - 1] : "Rating is required."}</p>
      </div>
    </fieldset>
  );
}
