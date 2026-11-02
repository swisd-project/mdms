#!/bin/bash

# mdms Test Setup and Runner
# SPDX-License-Identifier: MPL-2.0
# Copyright (c) 2026 Homahuki GmbH

set -e  # Exit on error

echo "🧪 Setting up mdms test environment..."

# Check if we're in the right directory
if [ ! -f "package.json" ]; then
    echo "❌ Error: Please run this from the mdms root directory"
    exit 1
fi

# Check if vitest is installed
if ! command -v vitest &> /dev/null; then
    echo "📦 Installing test dependencies..."

    if ! npm install -D vitest @types/vitest; then
        echo "❌ Failed to install vitest"
        exit 1
    fi
fi

echo "✓ Dependencies check complete"
echo ""

# Run the tests
echo "🚀 Running mdms tests..."
echo ""

if [ -f "src/custom-syntax.test.ts" ]; then
    echo "Running src/custom-syntax.test.ts..."
    npx vitest run src/custom-syntax.test.ts
    echo ""
fi

if [ -f "tests/core.test.ts" ]; then
    echo "Running tests/core.test.ts..."
    npx vitest run tests/core.test.ts
    echo ""
fi

echo "🎉 Test run complete!"
echo ""
echo "Expected: ~14 tests should pass (custom syntax tests + core tests)"
echo ""
echo "Note: Editor tests require additional setup with proper mocks."
echo "See TEST_SUITE.md for setup instructions."