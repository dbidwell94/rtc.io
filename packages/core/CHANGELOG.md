# @rtcio/core

## 0.2.0

### Minor Changes

- cb6399c: The id() function is now a getter -> rtc.id instead of rtc.id()

### Patch Changes

- cb6399c: Add a new event subscription to subscribe to when we have connected to a room. This allows for subscriptions elsewhere in case you need the id value other than where you call connectToRoom
- cb6399c: Fixed the connectionClosed not being fired when a peer disconnects

## 0.1.5

### Patch Changes

- 50e7e85: Add ability to get the id for the RTC session

## 0.1.4

### Patch Changes

- Added a 2 new event types which will automatically be subscribed to in the RTC class

## 0.1.3

### Patch Changes

- 384bbd4: Fixed typescript build chain to output ESNext instead of commonjs
- Updated dependencies [dc60668]
- Updated dependencies [384bbd4]
  - @rtcio/logger@0.1.2

## 0.1.2

### Patch Changes

- Updated dependencies
  - @rtcio/logger@0.1.1

## 0.1.1

### Patch Changes

- 5799949: Added @dbidwell94/ts-utils specifically to the package.json dependencies
