-- Phase 14 — CH-12: every chore template shows when it was last actually
-- completed and by whom. docs/04-DATABASE.md §4.x, docs/09-BUSINESS-RULES.md
-- BR-077.
--
-- Confirmed completions only: a done_pending row is pending, not done, and a
-- rejected one never becomes the last-completed. Derived from
-- chore_assignments, never stored — a template with no confirmed completion
-- reads null, which the client renders as "never completed" rather than
-- falling back to the template's creation date.
create view v_template_last_done
with (security_invoker = true) as
select t.house_id, t.id as template_id, t.name,
       a.done_at            as last_done_at,
       a.assignee_member_id as last_done_by,
       u.display_name       as last_done_by_name
  from chore_templates t
  left join lateral (
       select ca.done_at, ca.assignee_member_id
         from chore_assignments ca
        where ca.template_id = t.id and ca.status = 'confirmed'
        order by ca.done_at desc
        limit 1
  ) a on true
  left join house_members lm on lm.id = a.assignee_member_id
  left join users u          on u.id = lm.user_id;
