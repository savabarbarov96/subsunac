#!/usr/bin/env node

/**
 * Test script for the Subsunacs addon
 */

const { getIMDBInfo } = require('./lib/imdb');
const { searchSubtitles } = require('./lib/subsunacs');
const { parseStremioId } = require('./lib/utils');

async function testIMDB() {
  console.log('\n=== Testing IMDB Scraper ===');

  try {
    // Test with The Matrix (movie)
    const matrixInfo = await getIMDBInfo('tt0133093');
    console.log('✓ The Matrix:', matrixInfo);

    // Test with Breaking Bad (series)
    const breakingBadInfo = await getIMDBInfo('tt0903747');
    console.log('✓ Breaking Bad:', breakingBadInfo);

  } catch (error) {
    console.error('✗ IMDB test failed:', error.message);
  }
}

async function testSubsunacs() {
  console.log('\n=== Testing Subsunacs Scraper ===');

  try {
    // Test movie search
    const movieResults = await searchSubtitles('The Matrix', 1999);
    console.log(`✓ Found ${movieResults.length} subtitles for The Matrix`);
    if (movieResults.length > 0) {
      console.log('  First result:', movieResults[0]);
    }

  } catch (error) {
    console.error('✗ Subsunacs test failed:', error.message);
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
  console.log('Starting Subsunacs Addon Tests...\n');

  testUtils();
  await testIMDB();
  await testSubsunacs();

  console.log('\n=== Tests Complete ===\n');
}

runTests().catch(console.error);
