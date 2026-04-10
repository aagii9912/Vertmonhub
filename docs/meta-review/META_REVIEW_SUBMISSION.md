# Meta App Review Submission: Syncly

## App Description
**Syncly** (formerly SmartHub) is an AI-powered customer service automation platform designed to help small businesses on Facebook and Instagram manage their inquiries efficiently. It consolidates messages from multiple social channels into a unified inbox and uses AI to draft or send automated replies based on the business's inventory and policies.

## 1. Permissions & Features Verification

### **Permission: `pages_messaging`**
*   **Purpose**: This permission is critical for our "Unified Inbox" and "AI Auto-Reply" features.
*   **Usage**: Syncly uses this permission to retrieve incoming messages from the User's Facebook Page and display them in the Syncly Dashboard. It allows the business owner to reply manually or enables the AI agent to send relevant responses (e.g., checking stock, pricing) directly to the customer.
*   **Flow**: User connects their Page -> Incoming message is received via Webhook -> Displayed in Dashboard -> User/AI replies via API.

### **Permission: `instagram_manage_messages`**
*   **Purpose**: Required to provide the same automation capabilities for Instagram Direct Messages.
*   **Usage**: Syncly reads incoming DMs to identify customer intent (e.g., "Is this available?") and sends replies using the Instagram Graph API.
*   **Flow**: User connects Instagram Business Account -> DM received -> Analyzed by AI -> Response sent.

### **Permission: `pages_manage_metadata`**
*   **Purpose**: To subscribe to Webhooks for real-time updates.
*   **Usage**: Syncly needs to know when a new message arrives immediately to provide a "live chat" experience. This permission allows us to subscribe to the `messages` field in the Page subscription.

### **Permission: `pages_show_list`**
*   **Purpose**: To allow the user to select which Facebook Page they want to connect to Syncly.
*   **Usage**: During the onboarding flow, we display a list of pages the user manages so they can choose the specific business page to automate.

---

## 2. Screencast Walkthrough Script
*(Use the attached video file `syncly_app_review_demo.webm`)*

1.  **Landing Page**: The user lands on the Syncly home page, showcasing the branding and value proposition.
2.  **Authentication**: The user clicks "Login" and authenticates (via Clerk).
3.  **Onboarding/Connection**:
    *   The user navigates to "Settings" -> "Channels".
    *   Clicks "Connect Facebook".
    *   (In production) The Facebook OAuth popup appears (not fully recorded due to security policies, but the result is shown).
    *   The Page is listed as "Connected".
4.  **Feature Usage**:
    *   The user navigates to the "Inbox".
    *   A test message is received.
    *   The user sends a reply via the Syncly interface.
    *   This demonstrates that the app successfully reads and writes messages using the requested permissions.

## 3. Reviewer Notes
*   **Test Account**: Credentials provided in the App Review submission fields.
*   **Environment**: The screencast was recorded in our staging/dev environment but reflects the exact production flow.
