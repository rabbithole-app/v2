#!/bin/bash

# Script for creating 10 random user profiles in the canister
# Runs from Docker container

set -e

CANISTER_NAME="rabbithole-backend"
PROFILES_COUNT=10

echo "🎲 Starting generation of $PROFILES_COUNT random profiles..."

# Function for generating random username
generate_username() {
    local adjectives=("cool" "smart" "fast" "bright" "happy" "lucky" "brave" "wise" "kind" "bold")
    local nouns=("user" "player" "hero" "star" "king" "queen" "master" "legend" "champion" "winner")
    local adj=${adjectives[$((RANDOM % ${#adjectives[@]}))]}
    local noun=${nouns[$((RANDOM % ${#nouns[@]}))]}
    local num=$((RANDOM % 9999 + 1))
    echo "${adj}_${noun}_${num}"
}

# Function for generating random display name
generate_display_name() {
    local first_names=("John" "Jane" "Michael" "Sarah" "David" "Emily" "Robert" "Jessica" "William" "Ashley")
    local last_names=("Smith" "Johnson" "Williams" "Brown" "Jones" "Garcia" "Miller" "Davis" "Rodriguez" "Martinez")
    local first=${first_names[$((RANDOM % ${#first_names[@]}))]}
    local last=${last_names[$((RANDOM % ${#last_names[@]}))]}
    echo "${first} ${last}"
}

# Function for generating random avatar URL
generate_avatar_url() {
    local avatars=(
        "https://api.dicebear.com/7.x/avataaars/svg?seed=user1"
        "https://api.dicebear.com/7.x/avataaars/svg?seed=user2"
        "https://api.dicebear.com/7.x/avataaars/svg?seed=user3"
        "https://api.dicebear.com/7.x/avataaars/svg?seed=user4"
        "https://api.dicebear.com/7.x/avataaars/svg?seed=user5"
        "https://api.dicebear.com/7.x/avataaars/svg?seed=user6"
        "https://api.dicebear.com/7.x/avataaars/svg?seed=user7"
        "https://api.dicebear.com/7.x/avataaars/svg?seed=user8"
        "https://api.dicebear.com/7.x/avataaars/svg?seed=user9"
        "https://api.dicebear.com/7.x/avataaars/svg?seed=user10"
    )
    echo "${avatars[$((RANDOM % ${#avatars[@]}))]}"
}

# Function for creating profile
create_profile() {
    local username=$(generate_username)
    local display_name=$(generate_display_name)
    local avatar_url=$(generate_avatar_url)
    
    # 70% probability to have display name
    local has_display_name=$((RANDOM % 10))
    
    # 60% probability to have avatar
    local has_avatar=$((RANDOM % 10))
    
    # Get current identity principal
    principal=$(dfx identity get-principal 2>/dev/null || echo "unknown")
    
    echo "Creating profile: $username"
    echo "  Principal: $principal"
    echo "  Display Name: ${display_name:-"Not specified"}"
    echo "  Avatar: ${avatar_url:-"None"}"
    echo "  Inviter: None"
    
    # Form arguments for dfx call
    local args="record { username = \"$username\""
    
    if [ $has_display_name -lt 7 ]; then
        args="$args; displayName = opt \"$display_name\""
    else
        args="$args; displayName = null"
    fi
    
    if [ $has_avatar -lt 6 ]; then
        args="$args; avatarUrl = opt \"$avatar_url\""
    else
        args="$args; avatarUrl = null"
    fi
    
    args="$args; inviter = null }"
    
    # Call dfx canister call
    local result=$(dfx canister call "$CANISTER_NAME" createProfile "($args)" 2>&1)
    
    if [ $? -eq 0 ]; then
        echo "  ✅ Successfully created profile: $username"
        echo "  Result: $result"
    else
        echo "  ❌ Error creating profile: $username"
        echo "  Error: $result"
    fi
    
    echo ""
}

# Main loop for creating profiles
success_count=0
for i in $(seq 1 $PROFILES_COUNT); do
    echo "=== Profile $i of $PROFILES_COUNT ==="
    
    # Create unique identity for this profile
    identity_name="profile_${i}_$(date +%s)"
    echo "Creating identity: $identity_name"
    
    # Create new identity
    dfx identity new "$identity_name" --disable-encryption 2>/dev/null || {
        echo "  Warning: Identity $identity_name might already exist, using it anyway"
    }
    
    # Use the new identity
    dfx identity use "$identity_name"
    
    # Create profile with this identity
    create_profile
    success_count=$((success_count + 1))
    
    # Clean up - remove the identity file (optional)
    # dfx identity remove "$identity_name" 2>/dev/null || true
done

# Switch back to default identity
dfx identity use default

echo "=== Generation Results ==="
echo "Creation attempts: $PROFILES_COUNT"
echo "Successfully created: $success_count"

# Get total number of profiles in the system
echo ""
echo "Getting total number of profiles in the system..."
dfx canister call "$CANISTER_NAME" listProfiles '(record { filter = record { id = null; username = null; displayName = null; avatarUrl = null; inviter = null; createdAt = null }; sort = vec {}; pagination = record { limit = 50; offset = 0 }; count = true })'

echo ""
echo "🎉 Profile generation completed!"
