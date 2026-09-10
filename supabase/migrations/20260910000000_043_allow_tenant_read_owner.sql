/*
# ImoFlex - Allow tenants to read their landlords' basic profile info

## Problem
The users table RLS only allows users to read their own row (auth.uid() = id)
and landlords to read their tenants' info.
When a tenant loads the payment confirmation screen (Payer.tsx) or receipt (Recu.tsx),
they need to display the landlord's name for clarity and reassurance.
Without this policy, querying the landlord's full_name returns null or is blocked.

## Fix
Add a SELECT policy that allows a tenant to read a user's row
IF that user is the owner of a property leased to the tenant.
*/

DROP POLICY IF EXISTS "users_select_as_tenant" ON users;
CREATE POLICY "users_select_as_tenant" ON users FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM leases l
    JOIN properties p ON p.id = l.property_id
    WHERE l.tenant_id = auth.uid()
      AND p.owner_id = users.id
  )
);
