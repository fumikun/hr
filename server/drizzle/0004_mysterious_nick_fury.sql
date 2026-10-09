CREATE INDEX "assignments_slot_idx" ON "assignments" USING btree ("slot_id");--> statement-breakpoint
CREATE INDEX "assignments_status_idx" ON "assignments" USING btree ("status");--> statement-breakpoint
CREATE INDEX "audit_logs_actor_idx" ON "audit_logs" USING btree ("actor_id");--> statement-breakpoint
CREATE INDEX "availabilities_user_idx" ON "availabilities" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "shift_slots_department_starts_idx" ON "shift_slots" USING btree ("department_id","starts_at");--> statement-breakpoint
CREATE INDEX "shift_slots_post_idx" ON "shift_slots" USING btree ("post_id");--> statement-breakpoint
CREATE INDEX "user_roles_department_idx" ON "user_roles" USING btree ("department_id");