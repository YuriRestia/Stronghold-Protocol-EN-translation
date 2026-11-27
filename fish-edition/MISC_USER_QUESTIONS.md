# Blockshifting - scenario tests

Suppose we have a 3x1 field:

A B C

Enemy approaches from the left. Ascalon is deployed on A, facing left. Bubble is deployed on B. Cuora is deployed in C. Notably, Bubble and Cuora's attack range is 1x1, just their own tile.

## Scenario 1

- Enemy passes A.
- Enemy is blocked by Bubble. No visible blockshifting occurs.
- Only Ascalon and Bubble can attack the enemy.

## Scenario 2

- Bubble is dead, not deployed yet.
- Enemy passes A. Enemy is now in the left half of tile B.
- Bubble redeploys.
- Enemy is blocked by Bubble. Enemy is blockshifted.
- Only Ascalon and Bubble can attack the enemy.

## Scenario 3

- Bubble is dead, not deployed yet.
- Enemy passes A. Enemy is now in the right half of tile B.
- Bubble redeploys.
- Enemy is blocked by Bubble. Enemy is blockshifted.
- Ascalon, Bubble, and Cuora can attack the enemy.

## Scenario 4

- Bubble is dead, not deployed yet.
- Enemy passes A and B.
- Enemy is blocked by Cuora. No visible blockshifting occurs.
- Bubble redeploys.
- Ascalon, Bubble, and Cuora can attack the enemy.

## Scenario 5

- Bubble and Cuora are dead, not deployed yet.
- Enemy passes A and B. Enemy is now in the left half of tile C.
- Cuora redeploys.
- Enemy is blocked by Cuora. Enemy is blockshifted.
- Bubble redeploys.
- Enemy is still blocked by Cuora.
- Ascalon, Bubble, and Cuora can attack the enemy.

## Scenario 6

- Bubble and Cuora are dead, not deployed yet.
- Enemy passes A and B. Enemy is now in the right half of tile C.
- Cuora redeploys.
- Enemy is blocked by Cuora. Enemy is blockshifted.
- Bubble redeploys.
- Enemy is still blocked by Cuora.
- Only Cuora can attack the enemy.
