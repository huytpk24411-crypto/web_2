import { Pipe, PipeTransform } from '@angular/core';
import { ApiPolicyLevel } from '../classes/PayrollApi';
import { roomTypeLabel, policyTypeLabel, policyLevelLabel } from '../classes/display-labels';

@Pipe({ name: 'roomType', standalone: false })
export class RoomTypePipe implements PipeTransform {
  transform(value: string | null | undefined): string {
    return roomTypeLabel(value);
  }
}
@Pipe({ name: 'policyType', standalone: false })
export class PolicyTypePipe implements PipeTransform {
  transform(value: string): string {
    return policyTypeLabel(value);
  }
}
@Pipe({ name: 'policyLevel', standalone: false })
export class PolicyLevelPipe implements PipeTransform {
  transform(
    level: Pick<ApiPolicyLevel, 'from' | 'to' | 'amount' | 'rateBps'>,
    type: string,
  ): string {
    return policyLevelLabel(level, type);
  }
}
