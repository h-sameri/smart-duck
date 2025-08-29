# Data Flow Architecture

## User Query Processing Flow

```mermaid
sequenceDiagram
    participant U as User
    participant TG as Telegram Bot
    participant S as Server
    participant AI as AI Engine
    participant CG as CoinGecko
    participant SC as Smart Contract
    
    U->>TG: Send trading query
    TG->>S: Process user input
    S->>AI: Analyze query
    AI->>AI: Prompt guard validation
    AI->>AI: Extract ticker symbols
    AI->>CG: Fetch price history
    CG-->>AI: Return market data
    AI->>AI: Generate trading decision
    AI-->>S: Return analysis result
    S-->>TG: Format response
    TG-->>U: Display trading advice
    
    opt User confirms trade
        U->>TG: Confirm execution
        TG->>S: Execute trade request
        S->>SC: Submit transaction
        SC-->>S: Transaction result
        S-->>TG: Confirm execution
        TG-->>U: Show transaction hash
    end
```

## AI Analysis Pipeline

```mermaid
graph LR
    INPUT[User Query] --> GUARD[Prompt Guard]
    GUARD --> VALID{Valid?}
    VALID -->|No| REJECT[Reject Query]
    VALID -->|Yes| EXTRACT[Extract Ticker]
    EXTRACT --> FOUND{Ticker Found?}
    FOUND -->|No| GENERIC[Generic Advice]
    FOUND -->|Yes| FETCH[Fetch Price Data]
    FETCH --> ANALYZE[AI Analysis]
    ANALYZE --> DECISION[Trading Decision]
    GENERIC --> RESPONSE[Format Response]
    DECISION --> RESPONSE
    REJECT --> RESPONSE
    
    classDef process fill:#e3f2fd
    classDef decision fill:#fff3e0
    classDef endpoint fill:#e8f5e8
    
    class GUARD,EXTRACT,FETCH,ANALYZE process
    class VALID,FOUND decision
    class RESPONSE endpoint
```

## Data Flow Stages

### 1. Input Processing
- **User Input**: Natural language trading queries
- **Validation**: Input sanitization and format checking
- **Routing**: Request routing to appropriate handlers

### 2. AI Processing
- **Prompt Guard**: Validates query relevance for trading
- **Token Extraction**: Identifies cryptocurrency symbols
- **Market Data Fetch**: Retrieves price history and market data
- **AI Analysis**: Processes data through advanced AI model
- **Decision Generation**: Creates trading recommendations

### 3. Response Generation
- **Format Response**: Structures AI output for user consumption
- **Add Context**: Includes relevant market information
- **Error Handling**: Graceful handling of processing errors

### 4. Trade Execution (Optional)
- **User Confirmation**: User approves trade execution
- **Transaction Submission**: Smart contract interaction
- **Confirmation**: Transaction result and hash

## Data Sources and Sinks

### Input Data Sources
- **User Queries**: Natural language trading requests
- **Market Data**: Real-time price and volume information
- **Portfolio Data**: Current holdings and balances
- **Historical Data**: Past trading performance

### Output Data Sinks
- **User Interface**: Formatted responses and recommendations
- **Database**: Transaction records and user data
- **Blockchain**: Smart contract interactions
- **Cache**: Frequently accessed data storage

## Performance Considerations

### Caching Strategy
- **Price Data**: 5-minute cache for market data
- **User Data**: Session-based caching for user information
- **AI Responses**: Intelligent caching for similar queries

### Background Processing
- **Data Updates**: Asynchronous market data refreshing
- **Cache Warming**: Pre-loading essential data
- **Queue Management**: Efficient request queuing

### Error Handling
- **Graceful Degradation**: System continues operating during partial failures
- **Retry Logic**: Automatic retry for transient failures
- **Fallback Mechanisms**: Alternative data sources when primary fails
