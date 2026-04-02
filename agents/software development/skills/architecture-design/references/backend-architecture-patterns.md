# Backend Architecture Patterns

A high-end backend must be scalable, testable, and maintainable. Choose the pattern that best fits the project complexity.

## 1. Hexagonal Architecture (Ports & Adapters)

Recommended for complex business logic with multiple external integrations.

- **Core (Domain)**: Pure business logic, independent of frameworks or databases.

- **Ports**: Interfaces that define how the core interacts with the outside world (e.g., `UserRepository`).

- **Adapters**: Implementations of ports (e.g., `PostgresUserRepository`, `SendGridEmailAdapter`).

- **Benefit**: Extremely easy to test and swap infrastructure.

## 2. Layered Architecture (N-Tier)

Standard for medium complexity apps.

- **Presentation Layer**: API controllers, request validation.

- **Service Layer**: Business logic, transaction management.

- **Data Access Layer**: Repository pattern, ORM logic.

- **Benefit**: Clear separation of concerns and easy to understand.

## 3. Onion Architecture

Similar to Hexagonal but emphasizes dependency flow toward the center.

- **Domain Model**: Entities and basic rules.

- **Domain Services**: Complex domain operations.

- **Application Services**: Orchestration and use cases.

- **Interface-First**: Define the "What" (interface) before the "How" (implementation).

## Core Architectural Rules

- **Dependency Injection**: Never instantiate dependencies manually; use a DI container or constructor injection.

- **Decoupling**: Layers should only depend on the layer immediately below (or on abstractions).

- **Interface-First**: Define the "What" (interface) before the "How" (implementation).
