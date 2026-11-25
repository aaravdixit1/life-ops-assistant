/**
 * Realistic Sample Data Fixtures for Standalone Demo Mode.
 *
 * Hard Invariant:
 * Contains ONLY fictional persona ("Alex Chen") and academic/engineering data.
 * Zero real personal data, zero secrets, zero external dependencies.
 * Dates are calculated dynamically relative to today's date so the demo
 * always looks current and active.
 */

// Helper to get formatted ISO date string for day offsets from today
export function getRelativeDateTime(dayOffset: number, hours: number, minutes = 0): string {
  const d = new Date();
  d.setDate(d.getDate() + dayOffset);
  d.setHours(hours, minutes, 0, 0);
  return d.toISOString();
}

export function getRelativeDateString(dayOffset: number): string {
  const d = new Date();
  d.setDate(d.getDate() + dayOffset);
  return d.toISOString().split("T")[0];
}

// Format a date string into "YYYY-MM-DD"
function toDateStr(d: Date): string {
  return d.toISOString().split("T")[0];
}

/**
 * Generates calendar events covering the current week relative to today.
 */
export function generateDemoCalendarEvents(): any[] {
  const now = new Date();
  const currentDayOfWeek = now.getDay(); // 0 = Sun, 1 = Mon ...
  const mondayOffset = currentDayOfWeek === 0 ? -6 : 1 - currentDayOfWeek;

  const events: any[] = [];

  // Monday, Wednesday, Friday Schedule
  [-1, 1, 3].forEach((dayIdx) => {
    const offset = mondayOffset + dayIdx;

    // CS 3114 Lecture
    events.push({
      id: `demo-cs3114-${offset}`,
      summary: "CS 3114: Data Structures & Algorithms",
      calendar_name: "Academic Schedule",
      start_time: getRelativeDateTime(offset, 9, 0),
      end_time: getRelativeDateTime(offset, 10, 15),
      location: "Science Hall 102",
      description: "Prof. Roberts · B-Trees, graph traversals, and asymptotic complexity",
      color: "#0284c7",
      source: "canvas_sync",
    });

    // MATH 3134 Lecture
    events.push({
      id: `demo-math3134-${offset}`,
      summary: "MATH 3134: Applied Combinatorics",
      calendar_name: "Academic Schedule",
      start_time: getRelativeDateTime(offset, 11, 0),
      end_time: getRelativeDateTime(offset, 12, 15),
      location: "Engineering Hall 210",
      description: "Generating functions, inclusion-exclusion, recurrence relations",
      color: "#6366f1",
      source: "canvas_sync",
    });

    // Lunch Break
    events.push({
      id: `demo-lunch-${offset}`,
      summary: "Lunch & Refuel",
      calendar_name: "Routines",
      start_time: getRelativeDateTime(offset, 12, 30),
      end_time: getRelativeDateTime(offset, 13, 15),
      location: "Campus Commons",
      description: "Chipotle Grilled Chicken Bowl (56g protein)",
      color: "#10b981",
      source: "personal",
    });

    // LeetCode Practice
    events.push({
      id: `demo-leetcode-${offset}`,
      summary: "Daily LeetCode Practice (Sliding Window & DP)",
      calendar_name: "Career",
      start_time: getRelativeDateTime(offset, 14, 0),
      end_time: getRelativeDateTime(offset, 15, 0),
      location: "Library 3rd Floor",
      description: "Medium-level interview questions prep for Summer 2027 SWE rounds",
      color: "#f59e0b",
      source: "personal",
    });

    // Internship Applications
    events.push({
      id: `demo-internship-${offset}`,
      summary: "Internship Applications & Outreach",
      calendar_name: "Career",
      start_time: getRelativeDateTime(offset, 15, 0),
      end_time: getRelativeDateTime(offset, 16, 0),
      location: "Library 3rd Floor",
      description: "Review recruiter portals and track pipeline",
      color: "#f59e0b",
      source: "personal",
    });

    // Life-Ops Study Block
    events.push({
      id: `demo-study-cs3114-${offset}`,
      summary: "CS 3114 Study Block: B-Tree Storage Engine",
      calendar_name: "Life-Ops Autopilot",
      start_time: getRelativeDateTime(offset, 16, 30),
      end_time: getRelativeDateTime(offset, 18, 30),
      location: "North Commons Desk 14",
      description: "Focus session: Node split logic, block serialization, and cache eviction",
      color: "#d97706",
      source: "life_ops_study_block",
    });

    // Evening Gym Workout
    events.push({
      id: `demo-gym-${offset}`,
      summary: "Strength Conditioning: Upper Body Push",
      calendar_name: "Health & Fitness",
      start_time: getRelativeDateTime(offset, 19, 0),
      end_time: getRelativeDateTime(offset, 20, 15),
      location: "Recreation Center",
      description: "Bench press, incline dumbbell press, overhead press, dips",
      color: "#ef4444",
      source: "personal",
    });
  });

  // Tuesday, Thursday Schedule
  [0, 2].forEach((dayIdx) => {
    const offset = mondayOffset + 1 + dayIdx;

    // CS 2506 Lecture
    events.push({
      id: `demo-cs2506-${offset}`,
      summary: "CS 2506: Computer Organization II",
      calendar_name: "Academic Schedule",
      start_time: getRelativeDateTime(offset, 10, 0),
      end_time: getRelativeDateTime(offset, 11, 15),
      location: "Whittemore Hall 304",
      description: "Prof. Zhang · Cache hierarchy, virtual memory, pipelined hazards",
      color: "#0284c7",
      source: "canvas_sync",
    });

    // ENGE 2724 Studio
    events.push({
      id: `demo-enge2724-${offset}`,
      summary: "ENGE 2724: Engineering Design Studio",
      calendar_name: "Academic Schedule",
      start_time: getRelativeDateTime(offset, 11, 30),
      end_time: getRelativeDateTime(offset, 13, 0),
      location: "Goodwin Hall Studio 240",
      description: "Hardware-software co-design prototyping & CAD review",
      color: "#8b5cf6",
      source: "canvas_sync",
    });

    // Life-Ops Study Block
    events.push({
      id: `demo-study-cs2506-${offset}`,
      summary: "CS 2506 Lab Block: Cache Simulator",
      calendar_name: "Life-Ops Autopilot",
      start_time: getRelativeDateTime(offset, 15, 30),
      end_time: getRelativeDateTime(offset, 17, 30),
      location: "Engineering Lab Pod B",
      description: "L1/L2 multi-level cache simulation with LRU eviction",
      color: "#d97706",
      source: "life_ops_study_block",
    });

    // Systems Reading & Open Source
    events.push({
      id: `demo-systems-${offset}`,
      summary: "Distributed Systems Reading & Notes",
      calendar_name: "Learning",
      start_time: getRelativeDateTime(offset, 18, 0),
      end_time: getRelativeDateTime(offset, 19, 0),
      location: "The Daily Grind Cafe",
      description: "Raft consensus paper & pgvector index architectures",
      color: "#10b981",
      source: "personal",
    });
  });

  // Sunday Meal Prep
  const sundayOffset = mondayOffset + 6;
  events.push({
    id: `demo-mealprep-${sundayOffset}`,
    summary: "Weekly High-Protein Meal Prep",
    calendar_name: "Health & Fitness",
    start_time: getRelativeDateTime(sundayOffset, 11, 0),
    end_time: getRelativeDateTime(sundayOffset, 13, 0),
    location: "Home Kitchen",
    description: "Prep 6x Chipotle Chicken Bowls and 4x Overnight Protein Oats",
    color: "#10b981",
    source: "personal",
  });

  return events;
}

/**
 * Fictional persona assignments dynamically anchored around today.
 */
export function generateDemoAssignments(): any[] {
  return [
    {
      id: "demo-assign-1",
      course_id: "CS 2506",
      course_name: "CS 2506 Computer Organization II",
      title: "Lab 7 — Multi-Level Cache Simulator & Miss Penalty Analysis",
      description:
        "Implement a cycle-accurate C++ simulation of direct-mapped and 4-way set associative L1/L2 caches. Evaluate hit rates with varying block sizes on SPEC CPU benchmarks.",
      due_at: getRelativeDateTime(1, 23, 59),
      points_possible: 50,
      is_submitted: false,
      submission_status: "pending",
      submission_types: ["online_upload"],
      url: "https://canvas.instructure.com/courses/demo/assignments/1",
      syllabus_notes: "Late penalty: 10% per 24 hours. Max 48 hours late.",
      is_tentative: false,
    },
    {
      id: "demo-assign-2",
      course_id: "CS 3114",
      course_name: "CS 3114 Data Structures & Algorithms",
      title: "Project 3 — Disk-Backed B+ Tree Storage Engine",
      description:
        "Construct a high-performance, disk-backed B+ tree index supporting concurrent reads, block splits, and LRU buffer pool management. Tested against 1M key-value insertions.",
      due_at: getRelativeDateTime(3, 23, 59),
      points_possible: 150,
      is_submitted: false,
      submission_status: "pending",
      submission_types: ["online_upload"],
      url: "https://canvas.instructure.com/courses/demo/assignments/2",
      syllabus_notes: "35% of course grade. Autograder evaluates valgrind memory leaks and cache locality.",
      is_tentative: false,
    },
    {
      id: "demo-assign-3",
      course_id: "MATH 3134",
      course_name: "MATH 3134 Applied Combinatorics",
      title: "Problem Set 8 — Generating Functions & Linear Recurrences",
      description:
        "Solve problems 4.1–4.9 on ordinary and exponential generating functions, Catalan numbers, and integer partitions. Submit typeset in LaTeX.",
      due_at: getRelativeDateTime(5, 17, 0),
      points_possible: 40,
      is_submitted: false,
      submission_status: "pending",
      submission_types: ["online_upload"],
      url: "https://canvas.instructure.com/courses/demo/assignments/3",
      syllabus_notes: "Drop lowest homework score policy applies at end of semester.",
      is_tentative: false,
    },
    {
      id: "demo-assign-4",
      course_id: "ENGE 2724",
      course_name: "ENGE 2724 Engineering Design & Prototyping",
      title: "Milestone 3 — Midterm Systems Architecture & BOM Review",
      description:
        "Deliver Bill of Materials (BOM), CAD mechanical assembly diagrams, and micro-controller communication protocol specification for the autonomous navigation cart.",
      due_at: getRelativeDateTime(6, 23, 59),
      points_possible: 100,
      is_submitted: false,
      submission_status: "pending",
      submission_types: ["online_upload"],
      url: "https://canvas.instructure.com/courses/demo/assignments/4",
      syllabus_notes: "Peer evaluation rubrics account for 20% of milestone grade.",
      is_tentative: false,
    },
    {
      id: "demo-assign-5",
      course_id: "CS 3114",
      course_name: "CS 3114 Data Structures & Algorithms",
      title: "Homework 5 — Red-Black Tree Balancing & Left-Leaning Invariants",
      description:
        "Theoretical analysis and trace proofs of LL-Red-Black tree rotations during batch sequential insertions.",
      due_at: getRelativeDateTime(-3, 23, 59),
      points_possible: 100,
      is_submitted: true,
      submission_status: "submitted",
      grade: 98,
      submission_types: ["online_upload"],
      url: "https://canvas.instructure.com/courses/demo/assignments/5",
      syllabus_notes: "Graded: 98/100 (Clean rotation proofs).",
      is_tentative: false,
    },
    {
      id: "demo-assign-6",
      course_id: "CS 2506",
      course_name: "CS 2506 Computer Organization II",
      title: "Lab 6 — Pipelined Datapath Data Hazards & Forwarding Unit",
      description:
        "Design forwarding and hazard detection units in Verilog/Logisim for a 5-stage RISC-V pipelined datapath.",
      due_at: getRelativeDateTime(-5, 23, 59),
      points_possible: 50,
      is_submitted: true,
      submission_status: "submitted",
      grade: 50,
      submission_types: ["online_upload"],
      url: "https://canvas.instructure.com/courses/demo/assignments/6",
      syllabus_notes: "Graded: 50/50.",
      is_tentative: false,
    },
    {
      id: "demo-assign-7",
      course_id: "CS 3114",
      course_name: "CS 3114 Data Structures & Algorithms",
      title: "Final Capstone Milestone — Distributed Index Evaluation",
      description:
        "Benchmarking B+ Tree vs LSM-tree on SSD NVMe drives under skewed Zipfian workloads. Comprehensive written report and presentation.",
      due_at: getRelativeDateTime(18, 23, 59),
      points_possible: 200,
      is_submitted: false,
      submission_status: "pending",
      submission_types: ["online_upload"],
      url: "https://canvas.instructure.com/courses/demo/assignments/7",
      syllabus_notes: "Final project symposium presentation during finals week.",
      is_tentative: true,
    },
  ];
}

/**
 * Autopilot audit logs with 1-click Undo payload.
 */
export function generateDemoAutopilotLogs(): any[] {
  return [
    {
      id: "log-demo-1",
      action_type: "auto_shift_study_block",
      summary: "Shifted CS 3114 Study Block by +2h due to Canvas due date update",
      details:
        "Canvas polling detected CS 3114 Project 3 due date moved to Friday 23:59. Autopilot rebalanced Thursday study session to 16:30 – 18:30 to maximize uninterrupted deep work.",
      created_at: getRelativeDateTime(-1, 14, 22),
      is_undone: false,
      rollback_payload: {
        event_id: "demo-study-cs3114--1",
        original_start: getRelativeDateTime(-1, 14, 30),
        original_end: getRelativeDateTime(-1, 16, 30),
      },
    },
    {
      id: "log-demo-2",
      action_type: "rebalance_prep_block",
      summary: "Rebalanced MATH 3134 review block after resolving lab conflict",
      details:
        "Proactively shifted Combinatorics practice block away from ENGE 2724 extended lab hours to avoid schedule crunch.",
      created_at: getRelativeDateTime(-2, 18, 4),
      is_undone: false,
      rollback_payload: {
        event_id: "demo-study-math-rebalance",
        original_start: getRelativeDateTime(-2, 13, 0),
        original_end: getRelativeDateTime(-2, 14, 30),
      },
    },
    {
      id: "log-demo-3",
      action_type: "schedule_meal_prep",
      summary: "Scheduled Sunday meal prep block following grocery shopping window",
      details:
        "Inserted 2-hour high-protein batch cooking block at 11:00 AM on Sunday, keeping weekly nutrition targets on schedule.",
      created_at: getRelativeDateTime(-3, 10, 15),
      is_undone: false,
    },
  ];
}

/**
 * Pending actions requiring explicit user approval.
 */
export function generateDemoPendingActions(): any[] {
  return [
    {
      id: "pending-demo-conflict-1",
      action_type: "reschedule_study_block",
      summary: "Dentist Appointment Conflict with CS 2506 Lab Block",
      details:
        "An upcoming Dentist Appointment on Thursday at 2:00 PM overlaps with scheduled prep for CS 2506 Lab 7. Autopilot proposes shifting the study block to 4:00 PM – 6:00 PM.",
      created_at: getRelativeDateTime(0, 8, 30),
      status: "pending",
      diff_preview: {
        event_id: "demo-study-cs2506-pending",
        summary: "CS 2506 Lab Block: Cache Simulator",
        old_start: getRelativeDateTime(1, 14, 0),
        old_end: getRelativeDateTime(1, 16, 0),
        new_start: getRelativeDateTime(1, 16, 0),
        new_end: getRelativeDateTime(1, 18, 0),
        reason: "Fixed medical appointment priority over automated study block",
      },
    },
  ];
}

/**
 * Daily Briefing data for today.
 */
export function generateDemoDailyBrief(): any {
  return {
    date: new Date().toLocaleDateString("en-US", {
      weekday: "long",
      month: "long",
      day: "numeric",
      year: "numeric",
    }),
    greeting: "Good morning, Alex. You have 3 classes and 1 high-priority lab deliverable today.",
    weather: {
      location: "Campus District",
      temp_f: 64,
      condition: "Partly Cloudy",
      high_f: 68,
      low_f: 48,
      wind_mph: 7,
      humidity: 46,
    },
    metrics: {
      active_deadlines: 4,
      pending_approvals: 1,
      today_events: 5,
      protein_target_g: 175,
      protein_logged_g: 138,
      budget_remaining_cents: 2050,
    },
    daily_plans: [
      {
        id: "plan-deep-focus",
        name: "Deep Focus Protocol",
        badge: "Recommended",
        description: "2h uninterrupted block on CS 3114 B-Tree implementation + 1h Combinatorics review.",
        focus_hours: 3.5,
        target_course: "CS 3114",
      },
      {
        id: "plan-balanced-velocity",
        name: "Balanced Velocity",
        badge: "Steady Pace",
        description: "Finish CS 2506 Cache Simulator lab write-up early, followed by 1h LeetCode prep.",
        focus_hours: 2.5,
        target_course: "CS 2506",
      },
      {
        id: "plan-recovery-first",
        name: "Review & Recovery First",
        badge: "Low Fatigue",
        description: "Complete quick code review, take an earlier evening gym session, and recharge.",
        focus_hours: 1.5,
        target_course: "Routines",
      },
    ],
    curiosity: {
      id: "curiosity-1",
      category: "Systems & Computing History",
      tag: "Computer Architecture",
      title: "The Moth in the Harvard Mark II",
      did_you_know:
        "The term 'computer bug' was popularized in September 1947 when Grace Hopper's team at Harvard University found an actual moth trapped between Relay #70 of the Mark II computer. The moth was taped into the lab logbook with the note: 'First actual case of bug being found.'",
      reflection:
        "Modern debugging has evolved from picking moths out of electromagnetic relays to analyzing valgrind traces and memory profiles—yet the satisfaction of finding the root cause remains identical.",
      footnote: "Harvard University Archives, Mark II Logbook",
    },
    study_sanctuary: {
      name: "The Daily Grind Cafe & Roastery",
      tag: "Study Sanctuary",
      distance: "0.4 miles from Engineering Quad",
      noise_level: "Quiet Low Hum (45 dB)",
      features: "High natural lighting, second-floor study mezzanine, reliable 350 Mbps Wi-Fi, single-origin pour-overs",
    },
    dispatch_news: [
      {
        headline: "Systems Symposium: Keynote on zero-copy I/O runtimes",
        source: "Campus Tech Dispatch",
        date: "Today",
      },
      {
        headline: "Autonomous Rover Club advances to regional competition finals",
        source: "Engineering Society",
        date: "Yesterday",
      },
    ],
  };
}

export const DEMO_CURIOSITIES = [
  {
    id: "curiosity-1",
    category: "Systems & Computing History",
    tag: "Architecture",
    title: "The Moth in the Harvard Mark II",
    did_you_know:
      "The term 'computer bug' was popularized in 1947 when Grace Hopper's team found an actual moth trapped in Relay #70 of the Harvard Mark II electromechanical computer. The moth was taped into the logbook with the entry: 'First actual case of bug being found.'",
    reflection: "Physical relays have become 3nm transistors, but tracking down subtle bugs remains the core thrill of systems engineering.",
    footnote: "Smithsonian National Museum of American History",
  },
  {
    id: "curiosity-2",
    category: "Algorithms & Mathematics",
    tag: "Graph Theory",
    title: "The Seven Bridges of Königsberg",
    did_you_know:
      "In 1736, Leonhard Euler solved the problem of whether one could walk through Königsberg crossing each of its seven bridges exactly once. By proving it was impossible, Euler founded graph theory and topology in a single stroke.",
    reflection: "Abstracting physical islands into vertices and bridges into edges demonstrated that topological structure matters more than spatial layout.",
    footnote: "Euler, Solutio problematis ad geometriam situs pertinentis (1736)",
  },
  {
    id: "curiosity-3",
    category: "Distributed Systems",
    tag: "Consensus",
    title: "Leslie Lamport and Logical Clocks",
    did_you_know:
      "Leslie Lamport introduced logical clocks in 1978 after realizing that distributed systems cannot rely on physical clocks due to relativistic time drift. His paper is one of the most cited in computer science history.",
    reflection: "Ordering events by causal happens-before relationships laid the foundation for modern distributed databases and consensus protocols.",
    footnote: "CACM 1978: Time, Clocks, and the Ordering of Events in a Distributed System",
  },
  {
    id: "curiosity-4",
    category: "Unix & Operating Systems",
    tag: "Philosophy",
    title: "The Unix Pipe Operator",
    did_you_know:
      "Doug McIlroy proposed the Unix pipeline operator ('|') in 1972 over a series of lunch conversations with Ken Thompson. Ken implemented pipes in the Unix kernel in a single night.",
    reflection: "The Unix philosophy—write programs that do one thing well and compose them through text streams—remains the gold standard for software modularity.",
    footnote: "Bell Labs Computing Sciences Research",
  },
];

/**
 * Health & Meal Prep sample data.
 */
export function generateDemoHealthData() {
  const recipes = [
    {
      id: "recipe-1",
      name: "Chipotle Grilled Chicken & Jasmine Rice",
      meal_type: "lunch",
      calories: 680,
      protein_g: 56,
      carbs_g: 78,
      fat_g: 14,
      cost_estimate_cents: 295,
      prep_time_min: 25,
      tags: ["High-Protein", "Meal-Prep", "Lean-Bulk"],
      instructions:
        "1. Marinate diced chicken thighs with chipotle adobo, lime, garlic, and cumin.\n2. Sear on high cast-iron heat for 6 mins until 165°F internal.\n3. Serve over 1.5 cups steamed jasmine rice with black beans and cilantro.",
      ingredients: [
        { name: "Boneless Skinless Chicken Thighs", qty: 8, unit: "oz", protein_g: 48, est_cost_cents: 185 },
        { name: "Jasmine Rice (cooked)", qty: 1.5, unit: "cup", protein_g: 6, est_cost_cents: 40 },
        { name: "Black Beans (canned)", qty: 0.5, unit: "cup", protein_g: 7, est_cost_cents: 35 },
        { name: "Extra Virgin Olive Oil", qty: 1, unit: "tbsp", protein_g: 0, est_cost_cents: 35 },
      ],
    },
    {
      id: "recipe-2",
      name: "Crispy Salmon & Roasted Sweet Potato Hash",
      meal_type: "dinner",
      calories: 720,
      protein_g: 48,
      carbs_g: 65,
      fat_g: 26,
      cost_estimate_cents: 480,
      prep_time_min: 30,
      tags: ["Omega-3", "High-Protein", "Whole-Foods"],
      instructions:
        "1. Cube sweet potatoes and roast at 400°F with paprika and olive oil for 25 mins.\n2. Pan-sear salmon skin-side down for 5 mins until crispy, flip and finish for 3 mins.\n3. Plate with steamed broccoli florets and lemon zest.",
      ingredients: [
        { name: "Atlantic Salmon Fillet", qty: 7, unit: "oz", protein_g: 42, est_cost_cents: 380 },
        { name: "Sweet Potatoes (baked)", qty: 1.5, unit: "cup", protein_g: 3, est_cost_cents: 60 },
        { name: "Fresh Broccoli Florets", qty: 1.5, unit: "cup", protein_g: 3, est_cost_cents: 40 },
      ],
    },
    {
      id: "recipe-3",
      name: "High-Protein Greek Yogurt & Berry Bowl",
      meal_type: "breakfast",
      calories: 460,
      protein_g: 38,
      carbs_g: 54,
      fat_g: 8,
      cost_estimate_cents: 165,
      prep_time_min: 5,
      tags: ["Quick-Prep", "High-Protein", "Breakfast"],
      instructions:
        "1. Scoop 1.25 cups plain nonfat Greek yogurt into a chilled bowl.\n2. Fold in 1 scoop vanilla whey protein isolate and dash of cinnamon.\n3. Top with fresh blueberries and rolled oats.",
      ingredients: [
        { name: "Plain Nonfat Greek Yogurt", qty: 1.25, unit: "cup", protein_g: 28, est_cost_cents: 110 },
        { name: "Whey Protein Isolate", qty: 0.5, unit: "scoop", protein_g: 12, est_cost_cents: 40 },
        { name: "Fresh Blueberries", qty: 0.5, unit: "cup", protein_g: 1, est_cost_cents: 55 },
      ],
    },
  ];

  const loggedMealsToday = [
    {
      id: "log-meal-1",
      meal_name: "High-Protein Greek Yogurt & Berry Bowl",
      meal_type: "breakfast",
      calories: 460,
      protein_g: 38,
      carbs_g: 54,
      fat_g: 8,
      cost_estimate_cents: 165,
      date: toDateStr(new Date()),
    },
    {
      id: "log-meal-2",
      meal_name: "Chipotle Grilled Chicken & Jasmine Rice",
      meal_type: "lunch",
      calories: 680,
      protein_g: 56,
      carbs_g: 78,
      fat_g: 14,
      cost_estimate_cents: 295,
      date: toDateStr(new Date()),
    },
    {
      id: "log-meal-3",
      meal_name: "Post-Workout Whey Shake & Banana",
      meal_type: "snack",
      calories: 280,
      protein_g: 32,
      carbs_g: 36,
      fat_g: 2,
      cost_estimate_cents: 110,
      date: toDateStr(new Date()),
    },
  ];

  const dailyLog = {
    date: toDateStr(new Date()),
    target_calories: 2600,
    target_protein_g: 155,
    target_carbs_g: 320,
    target_fat_g: 75,
    total_calories: 1420,
    total_protein_g: 126,
    total_carbs_g: 168,
    total_fat_g: 24,
    total_cost_cents: 570,
    total_cost_usd: "$5.70",
    pct_calories: Math.min(100, Math.round((1420 / 2600) * 100)),
    pct_protein: Math.min(100, Math.round((126 / 155) * 100)),
    logs: loggedMealsToday,
    // Aliases for compatibility
    calories: 1420,
    protein_g: 126,
    carbs_g: 168,
    fat_g: 24,
    meals: loggedMealsToday,
  };

  const budget = {
    weekly_target_cents: 8500,
    spent_cents: 6450,
    remaining_cents: 2050,
    currency: "USD",
    weekly_grocery_estimate_usd: 85.0,
    target_daily_protein_g: 155,
    target_daily_calories: 2600,
    primary_protein: "Boneless Skinless Chicken Breast ($3.49/lb)",
    benchmark_items_count: 8,
  };

  const groceryPrices = [
    { id: "g-1", name: "Boneless Skinless Chicken Breast", category: "poultry", store: "Trader Joe's", unit: "lb", priceCents: 349, protein_g: 104 },
    { id: "g-2", name: "Boneless Skinless Chicken Thighs", category: "poultry", store: "Aldi", unit: "lb", priceCents: 299, protein_g: 96 },
    { id: "g-3", name: "Plain Nonfat Greek Yogurt (32 oz)", category: "dairy", store: "Trader Joe's", unit: "tub", priceCents: 429, protein_g: 88 },
    { id: "g-4", name: "Jasmine Rice (5 lb bag)", category: "grains", store: "Kroger", unit: "bag", priceCents: 599, protein_g: 45 },
    { id: "g-5", name: "Sweet Potatoes (3 lb bag)", category: "produce", store: "Aldi", unit: "bag", priceCents: 249, protein_g: 6 },
    { id: "g-6", name: "Atlantic Fresh Salmon Fillet", category: "seafood", store: "Trader Joe's", unit: "lb", priceCents: 899, protein_g: 90 },
    { id: "g-7", name: "Large Pasture-Raised Brown Eggs (12 pk)", category: "dairy", store: "Kroger", unit: "dozen", priceCents: 379, protein_g: 72 },
    { id: "g-8", name: "Old Fashioned Rolled Oats (32 oz)", category: "grains", store: "Aldi", unit: "canister", priceCents: 289, protein_g: 40 },
  ];

  const macroHistory = {
    days: [
      { date: getRelativeDateString(-6), calories: 2580, protein_g: 178, carbs_g: 275, fat_g: 74, target_met: true },
      { date: getRelativeDateString(-5), calories: 2620, protein_g: 182, carbs_g: 282, fat_g: 76, target_met: true },
      { date: getRelativeDateString(-4), calories: 2490, protein_g: 171, carbs_g: 260, fat_g: 71, target_met: true },
      { date: getRelativeDateString(-3), calories: 2610, protein_g: 176, carbs_g: 285, fat_g: 73, target_met: true },
      { date: getRelativeDateString(-2), calories: 2540, protein_g: 174, carbs_g: 270, fat_g: 72, target_met: true },
      { date: getRelativeDateString(-1), calories: 2630, protein_g: 180, carbs_g: 290, fat_g: 77, target_met: true },
      { date: getRelativeDateString(0), calories: 1420, protein_g: 126, carbs_g: 168, fat_g: 24, target_met: false },
    ],
    average_protein_g: 177,
    adherence_pct: 92,
  };

  return { recipes, dailyLog, budget, groceryPrices, macroHistory };
}

/**
 * User knowledge base facts.
 */
export function generateDemoKnowledge(): any[] {
  return [
    {
      id: "fact-1",
      category: "academics",
      title: "Target GPA & Honors Threshold",
      content: "Aiming for 3.85+ GPA in CS & Systems coursework to maintain Dean's List and qualify for graduate research fellowship.",
      metadata: { priority: "high" },
    },
    {
      id: "fact-2",
      category: "routines",
      title: "Circadian Rhythm & Caffeine Curfew",
      content: "Zero caffeine consumption after 2:00 PM to protect sleep architecture and overnight deep memory consolidation.",
      metadata: { rule: "caffeine_curfew" },
    },
    {
      id: "fact-3",
      category: "preferences",
      title: "Deep Work Soundscape",
      content: "Strictly instrumental ambient / lo-fi during programming and proof sessions. Zero spoken vocals.",
      metadata: { tag: "focus" },
    },
    {
      id: "fact-4",
      category: "fitness",
      title: "Weekly Lifting Split",
      content: "Upper / Lower 4-day resistance training split. Prioritize progressive overload on compound lifts.",
      metadata: { target: "lean_bulk" },
    },
  ];
}

/**
 * Semantic RAG mock database for academic syllabi and resume items.
 */
export function queryDemoRag(query: string, limit = 4, sourceType?: string): any[] {
  const q = query.toLowerCase();

  if (sourceType === "canvas_syllabus" || q.includes("grade") || q.includes("exam") || q.includes("late") || q.includes("policy")) {
    return [
      {
        id: "rag-syl-1",
        score: 0.94,
        source_type: "canvas_syllabus",
        title: "CS 3114 Syllabus — Late Submission & Autograder Policy",
        content:
          "Assignments submitted within 24 hours after the deadline incur a 10% penalty. Between 24 and 48 hours late, a 20% penalty applies. No submissions are accepted beyond 48 hours. Autograder test results on Git pushes reflect 70% of the project grade, with code style and valgrind cleanliness accounting for 30%.",
      },
      {
        id: "rag-syl-2",
        score: 0.91,
        source_type: "canvas_syllabus",
        title: "CS 3114 Syllabus — Grade Distribution Breakdown",
        content:
          "Grade Breakdown: Midterm 1 (15%), Midterm 2 (15%), Final Examination (25%), Programming Projects (35%), Theory Problem Sets (10%). An overall average of 90% or above guarantees an A- or higher.",
      },
      {
        id: "rag-syl-3",
        score: 0.88,
        source_type: "canvas_syllabus",
        title: "CS 2506 Syllabus — Laboratory Evaluation Rubric",
        content:
          "Labs must be verified during TA check-off hours or submitted with cycle trace logs. Memory hierarchy simulators must be written in C/C++ without external libraries beyond STL.",
      },
    ].slice(0, limit);
  }

  if (sourceType === "resume" || q.includes("resume") || q.includes("skill") || q.includes("project") || q.includes("experience")) {
    return [
      {
        id: "rag-res-1",
        score: 0.95,
        source_type: "resume",
        title: "Alex Chen — Education & Core Metrics",
        content:
          "Alex Chen · B.S. in Computer Science & Systems Engineering | GPA: 3.92 / 4.0 | Dean's List (All Semesters). Coursework: Data Structures & Algorithms, Computer Organization, Systems Architecture, Combinatorics, Distributed Systems.",
      },
      {
        id: "rag-res-2",
        score: 0.92,
        source_type: "resume",
        title: "Alex Chen — Work Experience: Systems Infrastructure Intern",
        content:
          "Alex Chen · Systems Software Intern · Architected high-throughput async telemetry collector handling 40k events/sec with sub-millisecond p99 latency in Go/C++. Reduced memory overhead by 34% by implementing custom arena allocators.",
      },
      {
        id: "rag-res-3",
        score: 0.89,
        source_type: "resume",
        title: "Alex Chen — Projects: Disk-Backed B+ Tree Index",
        content:
          "Alex Chen · Projects · Engineered a concurrent disk-backed B+ tree storage engine in C++ with LRU buffer caching, latch crabbing for multi-threaded read/write safety, and write-ahead logging.",
      },
    ].slice(0, limit);
  }

  return [
    {
      id: "rag-gen-1",
      score: 0.86,
      source_type: "knowledge_base",
      title: "Life-Ops Autopilot Rules",
      content:
        "Autopilot passively monitors Canvas deadlines and automatically adjusts study blocks tagged with 'source=life_ops_study_block'. Fixed academic lectures and confirmed medical appointments are never moved without explicit confirmation.",
    },
  ].slice(0, limit);
}
