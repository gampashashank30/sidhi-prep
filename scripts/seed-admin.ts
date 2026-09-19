#!/usr/bin/env node
// scripts/seed-admin.ts
// Creates the initial admin user in Supabase.
// Usage: npm run seed:admin
// Requires: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, ADMIN_EMAIL, ADMIN_PASSWORD
// in the environment (set in .env.local or shell).

import 'dotenv/config'; // loads .env.local automatically
import { createClient } from '@supabase/supabase-js';
import bcrypt from 'bcryptjs';

async function seedOne(db: any, emailInput: string, passwordInput: string) {
  const email = emailInput.toLowerCase().trim();

  // Check if admin already exists
  const { data: existing } = await db
    .from('users')
    .select('id, email, role')
    .eq('email', email)
    .maybeSingle();

  if (existing) {
    if (existing.role === 'admin') {
      console.log(`ℹ️   Admin already exists: ${email}`);
    } else {
      const { error } = await db
        .from('users')
        .update({ role: 'admin', status: 'active' })
        .eq('id', existing.id);
      if (error) {
        console.error(`❌  Failed to promote ${email} to admin:`, error.message);
        return;
      }
      console.log(`✅  Promoted existing user to admin: ${email}`);
    }
    return;
  }

  const passwordHash = await bcrypt.hash(passwordInput, 12);
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
    console.error(`❌  Failed to create admin ${email}:`, error.message);
    return;
  }

  console.log(`✅  Admin user created successfully: ${data.email} (ID: ${data.id})`);
}

async function main() {
  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const adminPassword = process.env.ADMIN_PASSWORD;

  if (!supabaseUrl || !serviceKey) {
    console.error('❌  SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set.');
    process.exit(1);
  }
  if (!adminPassword || adminPassword.length < 12) {
    console.error('❌  ADMIN_PASSWORD must be at least 12 characters.');
    process.exit(1);
  }

  const db = createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // Check if multiple emails or single email provided
  const rawEmails = process.env.ADMIN_EMAILS || process.env.ADMIN_EMAIL || 'Edsiddhi03@gmail.com,Director.siddhiops@gmail.com';
  const emails = rawEmails.split(',').map((e) => e.trim()).filter(Boolean);

  for (const email of emails) {
    await seedOne(db, email, adminPassword);
  }
}

main().catch((err) => {
  console.error('❌  Unexpected error:', err);
  process.exit(1);
});
