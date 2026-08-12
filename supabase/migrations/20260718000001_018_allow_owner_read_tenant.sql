/*
# ImoFlex - Allow owners to read their tenants' basic info

## Problem
The users table RLS only allows users to read their own row (auth.uid() = id).
When a landlord (propriétaire) loads the FicheBail screen, Supabase performs a
JOIN on users to get the tenant's full_name and phone. This join returns NULL
because the RLS blocks the landlord from reading another user's row.

## Fix
Add a SELECT policy that allows a landlord to read a user's row
IF that user is a tenant on one of the landlord's properties.
The check uses the lease → property → owner chain already established
in the payments_select_owner policy.
*/

-- Allow owners to read their tenants' basic profile info
DROP POLICY IF EXISTS "users_select_as_owner" ON users;
CREATE POLICY "users_select_as_owner" ON users FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM leases l
    JOIN properties p ON p.id = l.property_id
    WHERE l.tenant_id = users.id
      AND p.owner_id = auth.uid()
  )
);
