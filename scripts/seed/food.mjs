/**
 * Food: a library the house has actually eaten from, two weeks of meals, what
 * they cost and who ate them, tonight's plan, and the shopping list behind it.
 *
 * Restrictions are real constraints here, not labels. The database refuses to
 * put somebody in a meal containing something they are allergic to, so the
 * allergens below are deliberately kept out of the meals that follow.
 */
import { admin, insertOne, must } from "./env.mjs";
import { addDays, at } from "./util.mjs";

const LIBRARY = {
  tamil: [
    { name: "Idli and sambar", types: ["breakfast"], items: ["Idli batter", "Toor dal", "Drumstick", "Sambar powder"], cost: 32_000, region: "Tamil Nadu" },
    { name: "Dosa and chutney", types: ["breakfast", "dinner"], items: ["Dosa batter", "Coconut", "Green chilli"], cost: 28_000, region: "Tamil Nadu" },
    { name: "Curd rice", types: ["lunch"], items: ["Rice", "Curd", "Curry leaves"], cost: 18_000, region: "Tamil Nadu" },
    { name: "Chicken biryani", types: ["lunch", "dinner"], items: ["Basmati rice", "Chicken", "Biryani masala", "Onion", "Curd"], cost: 96_000, region: "Tamil Nadu" },
    { name: "Sambar rice and poriyal", types: ["lunch"], items: ["Rice", "Toor dal", "Beans", "Coconut"], cost: 34_000, region: "Tamil Nadu" },
    { name: "Chapati and channa", types: ["dinner"], items: ["Atta", "Chickpeas", "Onion", "Tomato"], cost: 41_000, region: null },
    { name: "Lemon rice", types: ["lunch"], items: ["Rice", "Lemon", "Peanut-free tempering"], cost: 16_000, region: "Tamil Nadu" },
    { name: "Egg fried rice", types: ["dinner"], items: ["Rice", "Eggs", "Spring onion", "Carrot"], cost: 38_000, region: null },
  ],
  mixed: [
    { name: "Poha", types: ["breakfast"], items: ["Poha", "Onion", "Turmeric"], cost: 15_000, region: null },
    { name: "Upma", types: ["breakfast"], items: ["Rava", "Onion", "Green chilli"], cost: 14_000, region: null },
    { name: "Rajma chawal", types: ["lunch", "dinner"], items: ["Rajma", "Rice", "Onion", "Tomato"], cost: 44_000, region: "North India" },
    { name: "Veg pulao", types: ["lunch"], items: ["Basmati rice", "Carrot", "Beans", "Peas"], cost: 36_000, region: null },
    { name: "Chapati and mixed veg", types: ["dinner"], items: ["Atta", "Carrot", "Beans", "Potato"], cost: 33_000, region: null },
    { name: "Pasta in tomato sauce", types: ["dinner"], items: ["Pasta", "Tomato", "Garlic", "Herbs"], cost: 42_000, region: null },
  ],
  north: [
    { name: "Aloo paratha", types: ["breakfast"], items: ["Atta", "Potato", "Ghee"], cost: 34_000, region: "North India" },
    { name: "Poha", types: ["breakfast"], items: ["Poha", "Onion", "Turmeric"], cost: 15_000, region: null },
    { name: "Dal chawal", types: ["lunch"], items: ["Toor dal", "Rice", "Ghee"], cost: 26_000, region: "North India" },
    { name: "Rajma chawal", types: ["lunch", "dinner"], items: ["Rajma", "Rice", "Onion", "Tomato"], cost: 44_000, region: "North India" },
    { name: "Palak paneer and roti", types: ["dinner"], items: ["Spinach", "Paneer", "Atta", "Cream"], cost: 78_000, region: "North India" },
    { name: "Chole bhature", types: ["lunch"], items: ["Chickpeas", "Maida", "Onion"], cost: 62_000, region: "North India" },
    { name: "Khichdi", types: ["dinner"], items: ["Rice", "Moong dal", "Ghee"], cost: 22_000, region: "North India" },
  ],
};

/**
 * Kept out of every meal above on purpose. An allergy that never collides with
 * anything is not much of a demo, but a seed that trips its own database
 * constraint is worse — the collision belongs in a test, not here.
 */
const RESTRICTIONS = [
  { item_name: "Prawns", severity: "allergy", note: "Swells up within minutes. Nothing cooked in the same oil." },
  { item_name: "Peanuts", severity: "allergy", note: "Carries an antihistamine." },
  { item_name: "Milk", severity: "intolerance", note: "Fine in tea, not by the glass." },
  { item_name: "Beef", severity: "diet", note: null },
];

export async function seedFood(context) {
  const { houseId, home, memberIds, dependentIds, today, guestId } = context;
  const library = LIBRARY[home.cuisine];
  const eaters = [...memberIds, ...dependentIds];

  // ------------------------------------------------------------- the library
  const foods = new Map();
  for (const entry of library) {
    const row = await insertOne("foods", {
      house_id: houseId,
      name: entry.name,
      normalised_name: entry.name.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim(),
      default_source: "home_cooked",
      default_items: entry.items,
      region_tag: entry.region,
      meal_types: entry.types,
      typical_cost_paise: entry.cost,
      created_by: memberIds[0],
    });
    foods.set(entry.name, { id: row.id, ...entry });
  }

  // ------------------------------------------------------- who eats what
  for (const [index, restriction] of RESTRICTIONS.entries()) {
    if (index >= memberIds.length) break;
    await insertOne("member_restrictions", {
      house_id: houseId,
      member_id: memberIds[index],
      item_name: restriction.item_name,
      severity: restriction.severity,
      note: restriction.note,
    });
  }

  const ratings = ["like", "like", "okay", "dislike"];
  const preferences = [];
  for (const [memberIndex, memberId] of eaters.entries()) {
    for (const [foodIndex, food] of [...foods.values()].entries()) {
      if ((memberIndex + foodIndex) % 3 !== 0) continue;
      preferences.push({
        house_id: houseId,
        member_id: memberId,
        food_id: food.id,
        rating: ratings[(memberIndex + foodIndex) % ratings.length],
      });
    }
  }
  // One preference against a plain item rather than a library entry — the
  // schema allows exactly one of the two, and both paths should be visible.
  preferences.push({
    house_id: houseId,
    member_id: memberIds[0],
    item_name: "Bitter gourd",
    rating: "dislike",
  });
  must("insert food_preferences", await admin.from("food_preferences").insert(preferences).select("id"));

  // ------------------------------------------------------------- the meals
  // Written as rows rather than through `create_meal`, because that function
  // resolves the caller through `auth.uid()` and the seed has no session — it
  // answers NOT_A_MEMBER to the service role. What the function also does, and
  // what therefore has to be done here, is maintain `foods.times_eaten` and
  // `last_eaten_on`: the deterministic half of Try Today filters on
  // `times_eaten > 0`, so meals written without it leave every food invisible
  // to the suggestion engine and the screen renders empty for no visible reason.
  const catalogue = [...foods.values()];
  const eatenCount = new Map();
  const lastEaten = new Map();

  for (let offset = 14; offset >= 1; offset -= 1) {
    const date = addDays(today, -offset);
    const food = catalogue[offset % catalogue.length];
    const type = food.types.includes("dinner") ? "dinner" : food.types[0];

    // Once a fortnight the house orders in instead, which is the only way the
    // delivery and "bought" costs ever appear on the food screens.
    const orderedIn = offset === 4;
    const base = orderedIn ? Math.round(food.cost * 2.4) : food.cost;
    const delivery = orderedIn ? 6_000 : 0;
    const total = base + delivery;

    const meal = await insertOne("meals", {
      house_id: houseId,
      food_id: food.id,
      name: food.name,
      meal_date: date,
      meal_type: type,
      source: orderedIn ? "ordered" : "home_cooked",
      base_cost_paise: base,
      delivery_cost_paise: delivery,
      total_cost_paise: total,
      note: orderedIn ? "Nobody wanted to cook after the power cut." : null,
      created_by: memberIds[offset % memberIds.length],
      created_at: at(date, "21:00"),
    });

    must(
      "insert meal_items",
      await admin
        .from("meal_items")
        .insert(
          food.items.map((item, index) => ({
            house_id: houseId,
            meal_id: meal.id,
            food_id: food.id,
            name: item,
            quantity: index === 0 ? "1 kg" : null,
            cost_paise: index === 0 ? Math.round(base / 2) : null,
            sort_order: index,
          })),
        )
        .select("id"),
    );

    // Not everybody eats every meal — that is the whole reason food is costed
    // per participant rather than split by head count.
    const present = eaters.filter((_, index) => (index + offset) % 5 !== 0);
    const withGuest = guestId && offset <= 3;
    const mouths = present.length + (withGuest ? 1 : 0);
    const each = Math.floor(total / mouths);
    const remainder = total - each * mouths;

    const rows = present.map((memberId, index) => ({
      house_id: houseId,
      meal_id: meal.id,
      member_id: memberId,
      share_paise: each + (index < remainder ? 1 : 0),
    }));
    if (withGuest) {
      rows.push({
        house_id: houseId,
        meal_id: meal.id,
        guest_id: guestId,
        share_paise: each + (present.length < remainder ? 1 : 0),
      });
    }
    must("insert meal_participants", await admin.from("meal_participants").insert(rows).select("id"));

    eatenCount.set(food.id, (eatenCount.get(food.id) ?? 0) + 1);
    const previous = lastEaten.get(food.id);
    if (!previous || date > previous) lastEaten.set(food.id, date);
  }

  for (const [foodId, count] of eatenCount) {
    await admin
      .from("foods")
      .update({ times_eaten: count, last_eaten_on: lastEaten.get(foodId) })
      .eq("id", foodId);
  }

  // ------------------------------------------------------------- the plan
  await insertOne("meal_plans", {
    house_id: houseId,
    food_id: catalogue[1].id,
    name: catalogue[1].name,
    planned_date: today,
    created_by: memberIds[0],
  });
  await insertOne("meal_plans", {
    house_id: houseId,
    food_id: catalogue[3].id,
    name: catalogue[3].name,
    planned_date: addDays(today, 1),
    created_by: memberIds[1 % memberIds.length],
  });

  // --------------------------------------------------------- shopping list
  const shopping = [
    { name: "Rice", quantity: "5", unit: "kg", estimated_price_paise: 42_000 },
    { name: "Toor dal", quantity: "2", unit: "kg", estimated_price_paise: 36_000 },
    { name: "Onion", quantity: "3", unit: "kg", estimated_price_paise: 12_000 },
    { name: "Tomato", quantity: "2", unit: "kg", estimated_price_paise: 8_000 },
    { name: "Cooking oil", quantity: "1", unit: "l", estimated_price_paise: 18_000 },
    { name: "Milk", quantity: "6", unit: "packet", estimated_price_paise: 16_800 },
    { name: "Dish soap", quantity: "1", unit: null, estimated_price_paise: 9_000 },
    { name: "Curd", quantity: "1", unit: "kg", estimated_price_paise: 11_000 },
  ];

  must(
    "insert shopping_items",
    await admin
      .from("shopping_items")
      .insert(
        shopping.map((item, index) => ({
          house_id: houseId,
          ...item,
          created_by: memberIds[index % memberIds.length],
          checked_off: index < 3,
          checked_off_by: index < 3 ? memberIds[0] : null,
          checked_off_at: index < 3 ? at(addDays(today, -1), "18:30") : null,
        })),
      )
      .select("id"),
  );
}
