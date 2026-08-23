#!/usr/bin/env node
/**
 * Test script for Dashboard functionality
 */

console.log('🧪 Testing Dashboard Initialization...\n');

async function testDashboard() {
  try {
    console.log('Step 1: Importing React...');
    const { default: React } = await import('react');
    console.log('✅ React imported successfully');

    console.log('\nStep 2: Importing Ink...');
    const inkModule = await import('ink');
    console.log('✅ Ink imported successfully');

    console.log('\nStep 3: Importing Dashboard component...');
    const Dashboard = require('../lib/ui/dashboard');
    console.log('✅ Dashboard component loaded');

    console.log('\nStep 4: Creating Dashboard with mock stats...');
    const mockStats = {
      totalFiles: 64,
      totalTokens: 181480,
      totalBytes: 782336,
      totalLines: 28721,
      byExtension: {
        '.js': { count: 64, tokens: 181480 },
      },
    };

    const mockTopFiles = [
      { name: 'server.js', tokens: 12388 },
      { name: 'handler.js', tokens: 11007 },
      { name: 'security.js', tokens: 7814 },
    ];

    const components = {
      Box: inkModule.Box,
      Text: inkModule.Text,
      useInput: inkModule.useInput,
    };

    const dashboardElement = React.createElement(Dashboard, {
      stats: mockStats,
      topFiles: mockTopFiles,
      status: 'complete',
      components,
    });

    console.log('✅ Dashboard element created successfully');

    console.log('\nStep 5: Rendering dashboard (will auto-close after 2s)...');

    const instance = inkModule.render(dashboardElement);

    // Auto-close after 2 seconds
    setTimeout(() => {
      console.log('\n✅ Dashboard rendered successfully!');
      console.log('   Cleaning up...');
      instance.unmount();
      console.log('✅ Test complete!\n');

      console.log('╔════════════════════════════════════════════════════════╗');
      console.log('║          Dashboard Test: PASSED ✅                     ║');
      console.log('╚════════════════════════════════════════════════════════╝');
      console.log('\nTo use dashboard interactively:');
      console.log('  ctxman --dashboard\n');

      process.exit(0);
    }, 2000);
  } catch (error) {
    console.error('\n❌ Test failed:', error.message);
    console.error('\nStack trace:', error.stack);

    console.log('\n╔════════════════════════════════════════════════════════╗');
    console.log('║          Dashboard Test: FAILED ❌                     ║');
    console.log('╚════════════════════════════════════════════════════════╝');

    process.exit(1);
  }
}

testDashboard();
