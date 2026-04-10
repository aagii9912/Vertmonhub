#!/bin/bash

# Function to add env var
add_env() {
  local name=$1
  local value=$2
  echo "Adding $name..."
  echo -e "n\n$value" | npx vercel env add "$name" production
  echo -e "n\n$value" | npx vercel env add "$name" preview
  echo -e "n\n$value" | npx vercel env add "$name" development
}

# Supabase
add_env "NEXT_PUBLIC_SUPABASE_URL" "https://vmdfbijndijigohujfhr.supabase.co"
add_env "NEXT_PUBLIC_SUPABASE_ANON_KEY" "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZtZGZiaWpuZGlqaWdvaHVqZmhyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njc1ODg1ODYsImV4cCI6MjA4MzE2NDU4Nn0.oJkTcXPB7eoCm2VhB-j0l2lag1NXBU3e0ExuYxGxB-g"
add_env "SUPABASE_SERVICE_ROLE_KEY" "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZtZGZiaWpuZGlqaWdvaHVqZmhyIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NzU4ODU4NiwiZXhwIjoyMDgzMTY0NTg2fQ.h9mem79x7yb35LBrbg2AeXEUOJPRbv1mweNxLdddR-U"

# AI
add_env "GEMINI_API_KEY" "AIzaSyB_dRD0oaOqargJm4XT2bW6mA-RmRwVuIA"

# FB
add_env "FACEBOOK_APP_ID" "1412919253535199"
add_env "FACEBOOK_APP_SECRET" "your_facebook_app_secret"
add_env "FACEBOOK_PAGE_ACCESS_TOKEN" "EAAUFCuY0Cd8BQcg8yH8R6cashT3YFZCSqErZCNaMJZCIuA06CkMtAu0OLpE8OZA6wd1kSBLKqZBLbgrfOEmARoswVZCjPkUQHj00jj23H25iYjVyjAPOZBnwOpGD8JLhTxrRlhB1cpmY80lHQ9Fex3FjwGzLCTPAoJU6jaEkcu0wNMTPZAlZBR7JK3ESUZAeH5eoQl9yt0itnZAiQZDZD"
add_env "FACEBOOK_VERIFY_TOKEN" "smarthub_verify_token_2024"
add_env "FACEBOOK_PAGE_ID" "336410697184712"
