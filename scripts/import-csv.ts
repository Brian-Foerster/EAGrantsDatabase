/**
 * Import CSV data and convert to JSON format for the build pipeline
 * Usage: npx tsx scripts/import-csv.ts
 */

import * as fs from 'fs';
import * as path from 'path';
import { parse } from 'csv-parse/sync';
import { Grant } from '../types/grants';

const CSV_INPUT = path.join(process.cwd(), 'data', 'ea-grants-database.csv');
const JSON_OUTPUT = path.join(process.cwd(), 'lib', 'scraped-grants.json');

function parseBooleanField(value: string): boolean {
  return value === 'TRUE' || value === 'true' || value === '1';
}

function parseArrayField(value: string): string[] {
  if (!value || value.trim() === '') return [];
  return value.split(';').map(s => s.trim()).filter(s => s.length > 0);
}

function main() {
  console.log('📥 Importing CSV data...');
  
  // Read CSV file
  const csvContent = fs.readFileSync(CSV_INPUT, 'utf-8');
  
  // Parse CSV
  const records = parse(csvContent, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
  });
  
  console.log(`   Found ${records.length} records in CSV`);
  
  // Convert to Grant objects
  const grants: Grant[] = records.map((record: any) => {
    const grant: Grant = {
      id: record.id,
      title: record.title,
      recipient: record.recipient,
      amount: parseFloat(record.amount_usd),
      currency: 'USD',
      date: record.date,
      grantmaker: record.grantmaker,
      category: record.category || undefined,
      focus_area: record.focus_area || undefined,
      fund: record.fund || undefined,
      url: record.url || undefined,
      description: record.description || undefined,
    };
    
    // Optional fields
    if (record.is_residual && parseBooleanField(record.is_residual)) {
      grant.is_residual = true;
    }
    
    if (record.country) {
      grant.country = record.country;
    }
    
    if (record.topics) {
      grant.topics = parseArrayField(record.topics);
    }
    
    if (record.funders) {
      grant.funders = parseArrayField(record.funders);
    }
    
    return grant;
  });
  
  // Validate grants
  const validGrants = grants.filter(grant => {
    if (!grant.id || !grant.title || !grant.recipient || !grant.amount || !grant.date || !grant.grantmaker) {
      console.warn(`⚠️  Skipping invalid grant: ${grant.id || 'unknown'}`);
      return false;
    }
    return true;
  });
  
  console.log(`   Converted ${validGrants.length} valid grants`);
  
  // Save to JSON
  fs.writeFileSync(JSON_OUTPUT, JSON.stringify(validGrants));
  
  const fileSize = fs.statSync(JSON_OUTPUT).size;
  console.log(`✅ Saved ${validGrants.length} grants to ${JSON_OUTPUT}`);
  console.log(`   File size: ${(fileSize / 1024).toFixed(0)}KB`);
  
  // Print summary statistics
  const grantmakers = new Set(validGrants.map(g => g.grantmaker));
  const totalAmount = validGrants.reduce((sum, g) => sum + g.amount, 0);
  const dateRange = {
    earliest: validGrants.reduce((min, g) => g.date < min ? g.date : min, validGrants[0]?.date),
    latest: validGrants.reduce((max, g) => g.date > max ? g.date : max, validGrants[0]?.date),
  };
  
  console.log('\n📊 Summary:');
  console.log(`   Total grants: ${validGrants.length.toLocaleString()}`);
  console.log(`   Total amount: $${(totalAmount / 1000000).toFixed(2)}M`);
  console.log(`   Grantmakers: ${grantmakers.size} (${Array.from(grantmakers).join(', ')})`);
  console.log(`   Date range: ${dateRange.earliest} to ${dateRange.latest}`);
}

main();
