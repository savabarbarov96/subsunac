#!/usr/bin/env node

/**
 * Test script for the Bulgarian Subtitles addon
 * Tests all providers: Subsunacs, Yavka, SubsSab
 */

const { getIMDBInfo } = require('./lib/imdb');
const { searchAllProviders } = require('./lib/providers');
const subsunacs = require('./lib/providers/subsunacs');
const yavka = require('./lib/providers/yavka');
const subsab = require('./lib/providers/subsab');
const { parseStremioId } = require('./lib/utils');

async function testIMDB() {
  console.log('\n=== Testing IMDB Scraper ===');

  try {
    // Test with The Matrix (movie)
    const matrixInfo = await getIMDBInfo('tt0133093');
    console.log('✓ The Matrix:', matrixInfo);

    // Test with Breaking Bad (series)
    const breakingBadInfo = await getIMDBInfo('tt0903747', 'series');
    console.log('✓ Breaking Bad:', breakingBadInfo);

  } catch (error) {
    console.error('✗ IMDB test failed:', error.message);
  }
}

async function testSubsunacs() {
  console.log('\n=== Testing Subsunacs Provider ===');

  try {
    const results = await subsunacs.search('The Matrix', 1999);
    console.log(`✓ Found ${results.length} subtitles`);
    if (results.length > 0) {
      console.log('  First result:', {
        provider: results[0].provider,
        title: results[0].title,
        id: results[0].id
      });
    }
  } catch (error) {
    console.error('✗ Subsunacs test failed:', error.message);
  }
}

async function testYavka() {
  console.log('\n=== Testing Yavka Provider ===');

  try {
    const results = await yavka.search('The Matrix', 1999, null, null, 'tt0133093');
    console.log(`✓ Found ${results.length} subtitles`);
    if (results.length > 0) {
      console.log('  First result:', {
        provider: results[0].provider,
        title: results[0].title,
        id: results[0].id
      });
    }
  } catch (error) {
    console.error('✗ Yavka test failed:', error.message);
  }
}

async function testSubsSab() {
  console.log('\n=== Testing SubsSab Provider ===');

  try {
    const results = await subsab.search('The Matrix', 1999, null, null, 'tt0133093');
    console.log(`✓ Found ${results.length} subtitles`);
    if (results.length > 0) {
      console.log('  First result:', {
        provider: results[0].provider,
        title: results[0].title,
        id: results[0].id
      });
    }
  } catch (error) {
    console.error('✗ SubsSab test failed:', error.message);
  }
}

async function testAllProviders() {
  console.log('\n=== Testing All Providers (Parallel) ===');

  try {
    const results = await searchAllProviders('The Matrix', 1999, null, null, 'tt0133093');
    console.log(`✓ Found ${results.length} total subtitles from all providers`);

    // Count by provider
    const counts = {};
    for (const result of results) {
      counts[result.providerName] = (counts[result.providerName] || 0) + 1;
    }
    console.log('  Breakdown by provider:', counts);

  } catch (error) {
    console.error('✗ All providers test failed:', error.message);
  }
}

async function testUtils() {
  console.log('\n=== Testing Utilities ===');

  // Test movie ID parsing
  const movieId = parseStremioId('tt0133093');
  console.log('✓ Movie ID parsed:', movieId);

  // Test series ID parsing
  const seriesId = parseStremioId('tt0903747:1:1');
  console.log('✓ Series ID parsed:', seriesId);
}

async function runTests() {
  console.log('Starting Bulgarian Subtitles Addon Tests...');
  console.log('Providers: Subsunacs, Yavka, SubsSab\n');

  testUtils();
  await testIMDB();
  await testSubsunacs();
  await testYavka();
  await testSubsSab();
  await testAllProviders();

  console.log('\n=== Tests Complete ===\n');
}

runTests().catch(console.error);
