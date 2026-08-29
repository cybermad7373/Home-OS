import { describe, expect, it } from "vitest";
import { buildShoppingDrafts, type PlanForShopping } from "@/lib/domain/food/shopping";

describe("buildShoppingDrafts", () => {
  it("collects default_items from plans that link a library food", () => {
    const plans: PlanForShopping[] = [
      { foodId: "f1", defaultItems: ["Rice", "Dal"] },
      { foodId: "f2", defaultItems: ["Curd"] },
    ];
    expect(buildShoppingDrafts(plans, [])).toEqual(["Rice", "Dal", "Curd"]);
  });

  it("skips a plan with no linked food — there is no ingredient list to read", () => {
    const plans: PlanForShopping[] = [{ foodId: null, defaultItems: ["Rice"] }];
    expect(buildShoppingDrafts(plans, [])).toEqual([]);
  });

  it("does not duplicate an item already on the list, case- and punctuation-insensitive", () => {
    const plans: PlanForShopping[] = [{ foodId: "f1", defaultItems: ["rice", "Dal!"] }];
    expect(buildShoppingDrafts(plans, ["Rice"])).toEqual(["Dal!"]);
  });

  it("does not duplicate the same ingredient across two plans in the window", () => {
    const plans: PlanForShopping[] = [
      { foodId: "f1", defaultItems: ["Rice"] },
      { foodId: "f2", defaultItems: ["rice", "Onion"] },
    ];
    expect(buildShoppingDrafts(plans, [])).toEqual(["Rice", "Onion"]);
  });

  it("drops an empty ingredient name", () => {
    const plans: PlanForShopping[] = [{ foodId: "f1", defaultItems: ["  ", "Rice"] }];
    expect(buildShoppingDrafts(plans, [])).toEqual(["Rice"]);
  });

  it("is empty for an empty plan list", () => {
    expect(buildShoppingDrafts([], ["Rice"])).toEqual([]);
  });
});
