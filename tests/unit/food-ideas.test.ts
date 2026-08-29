import { describe, expect, it } from "vitest";
import { validateIdeas, type RawFoodIdea } from "@/lib/domain/llm/food-ideas";

function idea(overrides: Partial<RawFoodIdea> = {}): RawFoodIdea {
  return {
    name: "Vegetable Kothu Parotta",
    description: "A stir-fried flatbread dish with mixed vegetables and spices.",
    estimated_per_person_rupees: 60,
    items: ["parotta", "mixed vegetables", "spices"],
    ...overrides,
  };
}

function twoIdeas(overrides: Partial<RawFoodIdea> = {}): RawFoodIdea[] {
  return [
    idea(overrides),
    idea({ name: "Egg Shawarma Bowl", description: "A wrap-style bowl with egg and vegetables.", ...overrides }),
  ];
}

const baseInput = {
  libraryNames: ["Paruppu Sadham", "Curd Rice"],
  dislikedItems: ["bitter gourd"],
  excludedItems: ["peanut", "prawn"],
};

describe("validateIdeas — section 9.4, all-or-nothing", () => {
  it("accepts two well-formed, distinct ideas", () => {
    const result = validateIdeas({ ideas: twoIdeas(), ...baseInput });
    expect(result).not.toBeNull();
    expect(result).toHaveLength(2);
  });

  it("drops the whole response with only one idea", () => {
    const result = validateIdeas({ ideas: [idea()], ...baseInput });
    expect(result).toBeNull();
  });

  it("drops the whole response with three ideas", () => {
    const result = validateIdeas({ ideas: [...twoIdeas(), idea({ name: "Third" })], ...baseInput });
    expect(result).toBeNull();
  });

  it("drops a duplicate of a library entry, after normalisation", () => {
    const ideas = twoIdeas();
    ideas[0].name = "paruppu-sadham";
    const result = validateIdeas({ ideas, ...baseInput });
    expect(result).toBeNull();
  });

  it("drops an idea containing a disliked item", () => {
    const ideas = twoIdeas();
    ideas[0].items = ["bitter gourd", "onion"];
    const result = validateIdeas({ ideas, ...baseInput });
    expect(result).toBeNull();
  });

  it("drops an idea containing an excluded (restricted) item — never delegated to the prompt", () => {
    const ideas = twoIdeas();
    ideas[1].description = "A rich curry with peanut sauce.";
    const result = validateIdeas({ ideas, ...baseInput });
    expect(result).toBeNull();
  });

  it("matches containment both directions, same as the recommender's restriction filter", () => {
    const ideas = twoIdeas();
    ideas[0].items = ["peanut oil"];
    const result = validateIdeas({ ideas, ...baseInput });
    expect(result).toBeNull();
  });

  it("drops an idea with an implausible estimated cost", () => {
    const ideas = twoIdeas({ estimated_per_person_rupees: 0.5 });
    const result = validateIdeas({ ideas, ...baseInput });
    expect(result).toBeNull();
  });

  it("drops an idea naming a known chain", () => {
    const ideas = twoIdeas();
    ideas[0].description = "Just like the KFC bucket, but home-made.";
    const result = validateIdeas({ ideas, ...baseInput });
    expect(result).toBeNull();
  });

  it("drops an idea claiming availability nearby", () => {
    const ideas = twoIdeas();
    ideas[0].description = "Available at a shop nearby, order from there.";
    const result = validateIdeas({ ideas, ...baseInput });
    expect(result).toBeNull();
  });

  it("does not false-positive on an ordinary Title Case dish name", () => {
    const result = validateIdeas({ ideas: twoIdeas(), ...baseInput });
    expect(result).not.toBeNull();
  });

  it("converts rupees to paise on the way out", () => {
    const result = validateIdeas({ ideas: twoIdeas({ estimated_per_person_rupees: 60 }), ...baseInput });
    expect(result?.[0].estimatedPerPersonPaise).toBe(6000);
  });
});
