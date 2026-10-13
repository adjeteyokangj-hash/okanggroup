-- M18: Allow staff managers to update profiles (e.g. MFA required flag)

CREATE POLICY profiles_manage_by_staff_admins ON public.profiles
  FOR UPDATE TO authenticated
  USING (private.has_permission('org.staff.manage') OR private.has_permission('platform.roles.manage'))
  WITH CHECK (private.has_permission('org.staff.manage') OR private.has_permission('platform.roles.manage'));
