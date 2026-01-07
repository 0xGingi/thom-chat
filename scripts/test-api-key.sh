#!/bin/bash
# Test script for API key authentication
# Run with: ./scripts/test-api-key.sh <API_KEY>

API_KEY="$1"
BASE_URL="${2:-http://localhost:3432}"

if [ -z "$API_KEY" ]; then
    echo "Usage: ./scripts/test-api-key.sh <API_KEY> [BASE_URL]"
    exit 1
fi

echo "Testing API key authentication..."
echo "Base URL: $BASE_URL"
echo ""

# Test the generate-message endpoint
response=$(curl -s -X POST "$BASE_URL/api/generate-message" \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "message": "Say hello in exactly 5 words",
    "model_id": "openai/gpt-oss-120b"
  }')

echo "Response:"
echo "$response" | jq .

if echo "$response" | jq -e '.ok == true' > /dev/null 2>&1; then
    echo ""
    echo "✅ SUCCESS: API key authentication works!"
    echo "Conversation ID: $(echo "$response" | jq -r '.conversation_id')"
else
    echo ""
    echo "❌ FAILED: API key authentication failed"
    exit 1
fi
