# Parent Objectives And Star Shop Spec

This feature should connect parent intent, child motivation, and learning progress without creating a second parallel assignment system.

## Product Shape

Parents create objectives. Objectives can generate or organize work. Children complete work, earn stars, and can save or redeem stars in a parent-defined shop.

The first version should feel simple:

- Parent chooses a child.
- Parent creates an objective with a target.
- Parent optionally attaches a reward.
- Child sees the objective as a mission.
- Child earns stars through existing practice flows.
- Child can view shop items and request a reward.
- Parent approves or marks a reward as fulfilled.

## Existing Pieces

Already present:

- `rewards` table stores child star balance.
- Practice flows already award stars.
- Parent and child surfaces already show stars.
- Child home has a star-shop button stub.
- `children.child_goal` stores a simple goal string.
- Older docs describe `learning_plans` with `star_target`, `reward_description`, `reward_type`, and `stars_earned`.

Important constraint: do not create a disconnected reward economy. Stars shown today must be the same stars used by the shop.

## Core Concepts

### Objective

A parent-authored goal for one child.

Examples:

- Practice French conjugation 3 times this week.
- Complete 2 scanned worksheet sessions.
- Earn 50 stars for a book reward.
- Finish spelling practice every school day.

Objectives should be understandable to children, but authored by parents.

### Shop Item

A parent-created reward that can be redeemed with stars.

Examples:

- Choose dessert: 30 stars.
- New book: 80 stars.
- Movie night: 120 stars.
- Pick weekend activity: 150 stars.

### Redemption

A child request to spend stars on a shop item. Parent can approve, reject, or mark fulfilled.

## Proposed Data Model

Use explicit tables rather than overloading `assignments`.

### `parent_objectives`

- `id` uuid primary key
- `parent_id` uuid, auth user id
- `child_id` uuid
- `title` text
- `description` text nullable
- `subject` text nullable
- `skill_area` text nullable
- `target_type` text: `stars`, `sessions`, `assignments`, `streak`
- `target_value` int
- `current_value` int default 0
- `reward_item_id` uuid nullable
- `due_date` date nullable
- `status` text: `active`, `completed`, `paused`, `archived`
- `created_at` timestamptz
- `completed_at` timestamptz nullable

### `shop_items`

- `id` uuid primary key
- `parent_id` uuid
- `child_id` uuid nullable
- `title` text
- `description` text nullable
- `cost_stars` int
- `category` text nullable
- `image_emoji` text nullable
- `status` text: `active`, `paused`, `archived`
- `created_at` timestamptz

If `child_id` is null, the item can be shown to all children in the family.

### `reward_redemptions`

- `id` uuid primary key
- `parent_id` uuid
- `child_id` uuid
- `shop_item_id` uuid
- `stars_spent` int
- `status` text: `requested`, `approved`, `rejected`, `fulfilled`, `cancelled`
- `requested_at` timestamptz
- `approved_at` timestamptz nullable
- `fulfilled_at` timestamptz nullable
- `note` text nullable

Star deduction should happen on approval, not request. That lets a child explore/request without accidentally spending.

## Screen Plan

### Parent Dashboard

Add an "Objectives" section:

- Active objectives count.
- Current child objective cards.
- Button: `Create objective`.
- Objective card shows target, progress, due date, reward.

Add a "Rewards" or "Shop" management entry:

- Current star balance.
- Active shop items.
- Pending reward requests.
- Button: `Add reward`.

### Create Objective

Fields:

- Child
- Objective title
- Target type
- Target value
- Optional subject/skill area
- Optional due date
- Optional reward

For first version, avoid auto-generating assignments. The objective should track and frame work, not secretly create tasks.

### Child Home

Add a mission strip:

- "Your missions"
- Active objective cards
- Progress bar
- Reward if attached

Keep the existing assignment list separate.

### Star Shop

Replace the current coming-soon alert with a real screen:

- Star balance.
- Available rewards.
- Cost.
- Request button.
- Disabled state if not enough stars.
- Pending/approved request state.

### Parent Reward Requests

Show pending requests in parent dashboard:

- Child requested item.
- Stars cost.
- Approve/reject.
- Mark fulfilled.

## First Build Slice

Keep this small and testable.

1. Add read-only Star Shop screen using existing `rewards` balance and static placeholder shop items.
2. Change child home shop button to navigate to the screen instead of alerting.
3. Add parent dashboard card that explains objectives/rewards are coming next.
4. Add database migration draft for `shop_items`, `reward_redemptions`, and `parent_objectives`, but do not deploy until reviewed.

Why this slice:

- It makes the shop real enough for UX testing.
- It does not alter star balances.
- It avoids deploying live Supabase schema until the model is reviewed.

## Second Build Slice

1. Deploy `shop_items`.
2. Parent can create/edit/archive shop items.
3. Child can request a reward.
4. Parent sees pending request.
5. Parent approves request and stars are deducted.

## Third Build Slice

1. Deploy `parent_objectives`.
2. Parent can create simple objectives.
3. Child sees objectives as missions.
4. Objective progress updates from completed assignments/episodes.
5. Parent can mark objective complete or archive it.

## Open Questions

- Should objectives be purely motivational, or should they auto-create assignments?
- Do objectives have rewards, or can rewards stand alone?
- Should stars be spendable currency or lifetime achievement points with milestones?
- Should every child have their own shop, or should parents define family-wide defaults?
- Do we need parental approval before deducting stars?

Recommended answers for v1:

- Objectives should not auto-create assignments yet.
- Rewards can stand alone, but objectives may link to a reward.
- Stars should be spendable only when parent approves redemption.
- Shop items can be child-specific or family-wide.
- Parent approval is required before deduction.

