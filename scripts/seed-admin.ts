#!/usr/bin/env node
// scripts/seed-admin.ts
// Creates the initial admin user in Supabase.
// Usage: npm run seed:admin
// Requires: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, ADMIN_EMAIL, ADMIN_PASSWORD
// in the environment (set in .env.local or shell).

import 'dotenv/config'; // loads .env.local automatically
import { createClient } from '@supabase/supabase-js';
import bcrypt from 'bcryptjs';

async function main() {
  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const adminEmail = process.env.ADMIN_EMAIL;
  const adminPassword = process.env.ADMIN_PASSWORD;

  if (!supabaseUrl || !serviceKey) {
    console.error('❌  SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set.');
    process.exit(1);
  }
  if (!adminEmail || !adminPassword) {
    console.error('❌  ADMIN_EMAIL and ADMIN_PASSWORD must be set.');
    process.exit(1);
  }
  if (adminPassword.length < 12) {
    console.error('❌  ADMIN_PASSWORD must be at least 12 characters.');
    process.exit(1);
  }

  const db = createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const email = adminEmail.toLowerCase().trim();

  // Check if admin already exists
  const { data: existing } = await db
    .from('users')
    .select('id, email, role')
    .eq('email', email)
    .maybeSingle();

  if (existing) {
    if (existing.role === 'admin') {
      console.log(`✅  Admin already exists: ${email}`);
    } else {
      // Promote to admin
      const { error } = await db
        .from('users')
        .update({ role: 'admin', status: 'active' })
        .eq('id', existing.id);
      if (error) {
        console.error('❌  Failed to promote user to admin:', error.message);
        process.exit(1);
      }
      console.log(`✅  Promoted existing user to admin: ${email}`);
    }
    process.exit(0);
  }

  // Hash the password
  const passwordHash = await bcrypt.hash(adminPassword, 12);

  // Insert the admin user
  const { data, error } = await db
    .from('users')
    .insert({
      email,
      password_hash: passwordHash,
      role: 'admin',
      status: 'active',
    })
    .select('id, email')
    .single();

  if (error) {
    console.error('❌  Failed to create admin user:', error.message);
    process.exit(1);
  }

  console.log(`✅  Admin user created successfully:`);
  console.log(`    Email: ${data.email}`);
  console.log(`    ID:    ${data.id}`);
  console.log('');
  console.log('🔒  The plaintext password is NOT stored in the database.');
  console.log('    Remove ADMIN_PASSWORD from your environment after seeding.');
}

main().catch((err) => {
  console.error('❌  Unexpected error:', err);
  process.exit(1);
});
