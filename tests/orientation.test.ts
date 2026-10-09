import { describe, it, expect } from 'vitest';
import { Party } from '../src/party';

describe('Party orientation (left/right fix)', () => {
  it('at start position (1,7) facing north, solid wall (column 0) is on the LEFT', () => {
    const party = new Party(1, 7, 0); // x=1, y=7, facing north (dir=0)
    
    // Get the position to the left at distance 1
    const leftPos = party.getPosition(1, -1);
    expect(leftPos.x).toBe(0); // Column 0 is to the left
    expect(leftPos.y).toBe(6); // One step forward (north) and one left from (1,7)
    
    // Get the position to the right at distance 1
    const rightPos = party.getPosition(1, 1);
    expect(rightPos.x).toBe(2); // Column 2 is to the right
    expect(rightPos.y).toBe(6); // One step forward (north) and one right from (1,7)
  });
  
  it('turning left from north faces west', () => {
    const party = new Party(1, 7, 0); // facing north
    party.turnLeft();
    expect(party.dir).toBe(3); // west is direction 3
  });
  
  it('turning right from north faces east', () => {
    const party = new Party(1, 7, 0); // facing north
    party.turnRight();
    expect(party.dir).toBe(1); // east is direction 1
  });
  
  it('facing east, forward is +x, left is -y, right is +y', () => {
    const party = new Party(5, 5, 1); // x=5, y=5, facing east (dir=1)
    
    const forward = party.getForward();
    expect(forward).toEqual({ x: 6, y: 5 }); // east: +x
    
    const left = party.getPosition(1, -1);
    expect(left).toEqual({ x: 6, y: 4 }); // forward then left: +x, -y
    
    const right = party.getPosition(1, 1);
    expect(right).toEqual({ x: 6, y: 6 }); // forward then right: +x, +y
  });
  
  it('facing south, forward is +y, left is +x, right is -x', () => {
    const party = new Party(5, 5, 2); // x=5, y=5, facing south (dir=2)
    
    const forward = party.getForward();
    expect(forward).toEqual({ x: 5, y: 6 }); // south: +y
    
    const left = party.getPosition(1, -1);
    expect(left).toEqual({ x: 6, y: 6 }); // forward then left: +x, +y
    
    const right = party.getPosition(1, 1);
    expect(right).toEqual({ x: 4, y: 6 }); // forward then right: -x, +y
  });
  
  it('facing west, forward is -x, left is +y, right is -y', () => {
    const party = new Party(5, 5, 3); // x=5, y=5, facing west (dir=3)
    
    const forward = party.getForward();
    expect(forward).toEqual({ x: 4, y: 5 }); // west: -x
    
    const left = party.getPosition(1, -1);
    expect(left).toEqual({ x: 4, y: 6 }); // forward then left: -x, +y
    
    const right = party.getPosition(1, 1);
    expect(right).toEqual({ x: 4, y: 4 }); // forward then right: -x, -y
  });
});
