# BDD Test Cases — PowerMem CLI & Dashboard

## CLI Test Scenarios

### Feature: CLI Version and Help
```gherkin
Scenario: Show version number
  When I run "pmem --version"
  Then the output matches pattern "\\d+\\.\\d+\\.\\d+"

Scenario: Show main help
  When I run "pmem --help"
  Then the output contains "config"
  And the output contains "memory"
  And the output contains "stats"
  And the output contains "manage"
  And the output contains "shell"
```

### Feature: Config Management
```gherkin
Scenario: Show full configuration
  When I run "pmem config show"
  Then the output contains "vectorStore"
  And the output contains "llm"
  And the output contains "embedder"

Scenario: Show configuration as JSON
  When I run "pmem config show --json"
  Then the output is valid JSON
  And the JSON has key "vectorStore"
  And the JSON has key "llm"

Scenario: Show specific config section
  When I run "pmem config show --section llm"
  Then the output contains "llm"
  And the output does not contain "vectorStore"

Scenario: Validate configuration
  When I run "pmem config validate"
  Then the output contains "valid"
  And the exit code is 0

Scenario: Test component connections
  When I run "pmem config test"
  Then the output contains "Database"
  And the output contains "LLM"
  And the output contains "Embedder"

Scenario: Test specific component
  When I run "pmem config test --component database"
  Then the output contains "Database"
```

### Feature: Memory CRUD Operations
```gherkin
Scenario: Add a memory
  Given the database is empty
  When I run "pmem memory add 'User likes coffee' --user-id user1 --no-infer"
  Then the output contains "Memory created"
  And the exit code is 0

Scenario: Add a memory with JSON output
  Given the database is empty
  When I run "pmem --json memory add 'Test memory' --user-id user1 --no-infer"
  Then the output is valid JSON
  And the JSON field "memories" is an array with length >= 1

Scenario: Search memories
  Given memory "I love coffee" exists for user "user1"
  When I run "pmem memory search 'coffee' --user-id user1"
  Then the output contains "coffee"
  And the output contains "results"

Scenario: Search with limit
  Given 10 memories exist for user "user1"
  When I run "pmem memory search 'memory' --user-id user1 --limit 3"
  Then at most 3 results are shown

Scenario: List memories
  Given memories exist for user "user1"
  When I run "pmem memory list --user-id user1"
  Then the output contains "Total:"

Scenario: List with pagination
  Given 10 memories exist for user "user1"
  When I run "pmem memory list --user-id user1 --limit 3 --offset 0"
  Then the output shows 3 memories

Scenario: List with sorting
  Given multiple memories exist with different timestamps
  When I run "pmem memory list --sort created_at --order asc"
  Then memories are sorted by creation time ascending

Scenario: Get memory by ID
  Given memory with ID "12345" exists
  When I run "pmem memory get 12345"
  Then the output contains "ID: 12345"
  And the output contains "Content:"

Scenario: Get non-existent memory
  When I run "pmem memory get 99999"
  Then the output contains "not found"

Scenario: Delete memory
  Given memory with ID "12345" exists
  When I run "pmem memory delete 12345"
  Then the output contains "Deleted"

Scenario: Delete non-existent memory
  When I run "pmem memory delete 99999"
  Then the output contains "Not found"

Scenario: Delete all memories requires confirmation
  When I run "pmem memory delete-all --user-id user1"
  Then the output contains "Pass --confirm"

Scenario: Delete all memories with confirmation
  Given memories exist for user "user1"
  When I run "pmem memory delete-all --user-id user1 --confirm"
  Then the output contains "Deleted"
```

### Feature: Memory with Scope and Category
```gherkin
Scenario: Add memory with scope and category
  When I run "pmem memory add 'Buy milk' --user-id u1 --scope personal --category todo --no-infer"
  Then the memory is stored with scope "personal" and category "todo"

Scenario: Add memory with agent ID
  When I run "pmem memory add 'Agent memory' --user-id u1 --agent-id agent1 --no-infer"
  Then the memory is stored with agentId "agent1"
```

### Feature: Statistics
```gherkin
Scenario: Display statistics
  Given memories exist in the database
  When I run "pmem stats"
  Then the output contains "Total memories:"

Scenario: Display statistics as JSON
  Given memories exist in the database
  When I run "pmem --json stats"
  Then the output is valid JSON
  And the JSON has key "totalMemories"
  And the JSON has key "byType"
  And the JSON has key "ageDistribution"

Scenario: Display statistics filtered by user
  Given memories exist for users "alice" and "bob"
  When I run "pmem stats --user-id alice"
  Then statistics reflect only alice's memories
```

### Feature: Backup and Restore
```gherkin
Scenario: Backup memories to JSON file
  Given memories exist in the database
  When I run "pmem manage backup --output /tmp/backup.json"
  Then file "/tmp/backup.json" exists
  And the file contains valid JSON
  And the JSON has key "memories"
  And the JSON has key "count"

Scenario: Backup with user filter
  Given memories exist for users "alice" and "bob"
  When I run "pmem manage backup --output /tmp/alice.json --user-id alice"
  Then the backup contains only alice's memories

Scenario: Restore from backup (dry run)
  Given backup file "/tmp/backup.json" exists
  When I run "pmem manage restore /tmp/backup.json --dry-run"
  Then the output contains "Dry run"
  And no memories are modified

Scenario: Restore from backup
  Given backup file "/tmp/backup.json" exists with 5 memories
  And the database is empty
  When I run "pmem manage restore /tmp/backup.json"
  Then the output contains "Restored 5 memories"

Scenario: Cleanup duplicates
  Given duplicate memories exist
  When I run "pmem manage cleanup --strategy exact --dry-run"
  Then the output contains "Would check"
```

### Feature: Interactive Shell
```gherkin
Scenario: Shell shows welcome message
  When I start "pmem shell"
  Then the output contains "PowerMem Interactive Shell"
  And the prompt shows "powermem>"

Scenario: Shell add command
  Given the shell is running
  When I type "add I like coffee"
  Then the output contains "Memory created"

Scenario: Shell search command
  Given the shell is running and memories exist
  When I type "search coffee"
  Then search results are displayed

Scenario: Shell set and show commands
  Given the shell is running
  When I type "set user alice"
  Then the output contains "User ID: alice"
  When I type "show"
  Then the output contains "User ID: alice"

Scenario: Shell help command
  Given the shell is running
  When I type "help"
  Then available commands are listed

Scenario: Shell exit command
  Given the shell is running
  When I type "exit"
  Then the shell exits with "Bye!"
```

---

## Dashboard UI Test Scenarios

### Feature: Dashboard Overview Page
```gherkin
Scenario: Dashboard loads and shows stats cards
  Given the server is running with memories in the database
  When I navigate to "/dashboard/"
  Then I see 4 stat cards: Total Memories, Avg Importance, Access Density, Unique Dates
  And each card shows a numeric value

Scenario: Dashboard shows growth trend chart
  Given the server is running with memories over multiple days
  When I navigate to "/dashboard/"
  Then I see a line chart labeled "Growth Trend"
  And the chart has date labels on X axis

Scenario: Dashboard shows category distribution
  Given memories exist with different categories
  When I navigate to "/dashboard/"
  Then I see a pie chart labeled "Memory Categories"
  And the chart shows category segments

Scenario: Dashboard shows age distribution
  Given memories exist with different ages
  When I navigate to "/dashboard/"
  Then I see a bar chart labeled "Retention Age"
  And bars show "< 1 day", "1-7 days", "7-30 days", "> 30 days"

Scenario: Dashboard shows top accessed memories
  Given memories with varying access counts exist
  When I navigate to "/dashboard/"
  Then I see a table of "Hot Memories"
  And memories are sorted by access count descending

Scenario: Dashboard shows system health panel
  When I navigate to "/dashboard/"
  Then I see a system health card
  And it shows storage type, LLM provider, and uptime

Scenario: Time range filter works
  Given the dashboard is loaded
  When I select "Last 7 days" from the time range dropdown
  Then the stats and charts update to reflect 7-day data

Scenario: Refresh button reloads data
  Given the dashboard is loaded
  When I click the Refresh button
  Then the data refreshes
  And a success toast notification appears

Scenario: Dashboard shows loading skeletons
  When I navigate to "/dashboard/" with slow network
  Then I see skeleton loading placeholders
  And they replace with actual content when data loads
```

### Feature: Dashboard Error Handling
```gherkin
Scenario: API key error shows input
  Given the server requires an API key
  And no API key is configured
  When I navigate to "/dashboard/"
  Then I see an error card with "API key" message
  And I see an input field to enter the API key
  And I see an "Update Key" button

Scenario: Saving API key retries the request
  Given the API key error is displayed
  When I enter a valid API key and click "Update Key"
  Then the dashboard loads successfully
```

### Feature: Memories Page
```gherkin
Scenario: Memories page lists memories
  Given memories exist in the database
  When I navigate to "/dashboard/#/memories"
  Then I see a table of memories
  And each row shows ID, content, user, dates

Scenario: Delete memory from list
  Given the memories page is loaded with memories
  When I click the delete button on a memory row
  Then a confirmation dialog appears
  When I confirm the deletion
  Then the memory is removed from the list

Scenario: Bulk delete memories
  Given the memories page is loaded
  When I select multiple memories via checkboxes
  And I click "Delete Selected"
  Then selected memories are removed
```

### Feature: User Profile Page
```gherkin
Scenario: User profile page loads
  When I navigate to "/dashboard/#/user-profile"
  Then I see a user profile management interface

Scenario: Search user profiles
  Given user profiles exist
  When I enter a user ID in the search field
  Then matching profiles are displayed
```

### Feature: Settings Page
```gherkin
Scenario: Settings page shows configuration
  When I navigate to "/dashboard/#/settings"
  Then I see the current configuration settings
```

### Feature: Navigation and Theme
```gherkin
Scenario: Sidebar navigation works
  Given the dashboard is loaded
  When I click "Memories" in the sidebar
  Then I navigate to the memories page

Scenario: Theme toggle switches between light and dark
  Given the dashboard is loaded
  When I click the theme toggle
  Then the theme switches between light and dark mode

Scenario: Language switcher changes language
  Given the dashboard is loaded
  When I switch language to "中文"
  Then all UI labels change to Chinese
```

---

## Data Correctness Scenarios

### Feature: API Write → API Read Round-Trip
```gherkin
Scenario: Content, userId, metadata survive round-trip
  When I POST a memory with content "User likes dark roast coffee" and userId "verify-user-1"
  Then the returned memory has the exact same content and userId
  And listing memories for that user returns the same memory

Scenario: Search returns correct memory with score
  Given a memory "Alice works at Google as a software engineer" exists
  When I search for "software engineer Google"
  Then the top result contains "Google" and "engineer"
  And the score is between 0 and 1

Scenario: Delete removes memory permanently
  Given a memory exists with known ID
  When I DELETE that memory
  Then listing memories no longer includes that ID

Scenario: Stats reflect accurate counts
  Given 3 memories exist for a user
  When I GET stats for that user
  Then totalMemories equals 3
```

### Feature: API Write → Dashboard Displays Correctly
```gherkin
Scenario: Memory added via API appears in dashboard
  Given I POST a memory via the REST API
  When I navigate to the dashboard memories page
  Then the memory content and userId are visible in the table

Scenario: Stats cards show non-zero total
  Given memories exist in the database
  When I view the dashboard overview
  Then the "Total Memories" card shows a number > 0

Scenario: Growth trend shows today
  Given memories were added today
  When I view the dashboard overview
  Then the growth trend chart includes today's date
```

### Feature: User Isolation
```gherkin
Scenario: User A data not visible to user B
  Given memories exist for user A and user B
  When I list memories for user A
  Then only user A's memories appear
  And user B's content is not present

Scenario: Search isolation
  Given both users have memories with keyword "XYZ"
  When I search for "XYZ" as user A
  Then only user A's memory is returned

Scenario: Stats isolation
  Given 2 memories for user A and 1 for user B
  When I GET stats for user A
  Then totalMemories equals 2
```

### Feature: Data Type Fidelity
```gherkin
Scenario: Chinese content survives round-trip
  When I POST content "用户喜欢喝咖啡，住在上海浦东新区"
  Then GET returns the exact same string

Scenario: Emoji content survives round-trip
  When I POST content "I love 🐱 cats and ☕ coffee! 🎉🚀"
  Then GET returns the exact same string

Scenario: Special characters survive round-trip
  When I POST content with newlines, tabs, quotes, and HTML entities
  Then GET returns the exact same string

Scenario: Long content (500 chars) survives round-trip
  When I POST 500 characters of repeated text
  Then GET returns content with length 500+
```

### Feature: Pagination Correctness
```gherkin
Scenario: Pages have no ID overlap
  Given 5 memories exist for a user
  When I GET page 1 (limit=2, offset=0) and page 2 (limit=2, offset=2)
  Then page 1 has 2 items and page 2 has 2 items
  And total is 5
  And no IDs appear in both pages
```
