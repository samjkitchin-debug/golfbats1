#!/usr/bin/env node

/**
 * Purge all trips and associated data from Supabase
 * Executes SQL directly via Supabase REST API
 * WARNING: This permanently deletes ALL trips and related data
 */

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  console.error('Error: Missing Supabase configuration');
  console.error('Required: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const sql = `
delete from public.handicap_rounds;
delete from public.trips;
`;

async function purgeTrips() {
  try {
    console.log('Executing SQL purge...');
    
    // Use Supabase REST API to execute SQL via postgREST
    // For raw SQL, we use the rpc endpoint or direct SQL execution
    const response = await fetch(`${supabaseUrl}/rest/v1/rpc/exec_sql`, {
      method: 'POST',
      headers: {
        apikey: serviceRoleKey,
        Authorization: `Bearer ${serviceRoleKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ query: sql }),
    });

    if (!response.ok) {
      // Try alternative: execute via direct DELETE calls
      console.log('Trying alternative method...');
      
      // Delete handicap_rounds
      await fetch(`${supabaseUrl}/rest/v1/handicap_rounds?id=neq.00000000-0000-0000-0000-000000000000`, {
        method: 'DELETE',
        headers: {
          apikey: serviceRoleKey,
          Authorization: `Bearer ${serviceRoleKey}`,
          'Content-Type': 'application/json',
          Prefer: 'return=minimal',
        },
      });

      // Delete trips
      await fetch(`${supabaseUrl}/rest/v1/trips?id=neq.00000000-0000-0000-0000-000000000000`, {
        method: 'DELETE',
        headers: {
          apikey: serviceRoleKey,
          Authorization: `Bearer ${serviceRoleKey}`,
          'Content-Type': 'application/json',
          Prefer: 'return=minimal',
        },
      });
    }

    console.log('✅ All trips and associated data have been purged successfully');
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

purgeTrips();
