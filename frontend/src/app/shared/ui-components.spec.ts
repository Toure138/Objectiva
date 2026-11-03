import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';

import { ProgressBarComponent } from './progress-bar.component';
import { ProgressRingComponent } from './progress-ring.component';
import { SegmentedComponent } from './segmented.component';

describe('ProgressRingComponent', () => {
  it('garde la valeur entre 0 et 1 et décrit la progression', () => {
    const fixture = TestBed.createComponent(ProgressRingComponent);
    fixture.componentRef.setInput('size', 100);
    fixture.componentRef.setInput('stroke', 10);
    fixture.componentRef.setInput('label', '2 sur 3');

    fixture.componentRef.setInput('value', 5);
    fixture.detectChanges();
    const bar = fixture.nativeElement.querySelector('.bar') as SVGCircleElement;
    expect(Number(bar.getAttribute('stroke-dashoffset'))).toBeCloseTo(0);

    fixture.componentRef.setInput('value', -1);
    fixture.detectChanges();
    expect(Number(bar.getAttribute('stroke-dashoffset'))).toBeCloseTo(Number(bar.getAttribute('stroke-dasharray')));
    expect(fixture.nativeElement.querySelector('[role=img]').getAttribute('aria-label')).toBe('2 sur 3');
  });
});

describe('ProgressBarComponent', () => {
  it('expose la valeur arrondie et bornée aux lecteurs d’écran', () => {
    const fixture = TestBed.createComponent(ProgressBarComponent);
    fixture.componentRef.setInput('percent', 133.4);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[role=progressbar]').getAttribute('aria-valuenow')).toBe('100');
  });
});

describe('SegmentedComponent', () => {
  const options = [
    { value: 'a', label: 'A' },
    { value: 'b', label: 'B' },
    { value: 'c', label: 'C' },
  ];

  it('marque l’option choisie et change de valeur au clic', () => {
    const fixture = TestBed.createComponent(SegmentedComponent);
    fixture.componentRef.setInput('options', options);
    fixture.componentRef.setInput('value', 'b');
    fixture.detectChanges();
    const buttons = fixture.nativeElement.querySelectorAll('button') as NodeListOf<HTMLButtonElement>;
    expect(buttons[1].getAttribute('aria-checked')).toBe('true');
    expect(buttons[0].getAttribute('aria-checked')).toBe('false');

    buttons[2].click();
    fixture.detectChanges();
    expect(fixture.componentInstance.value()).toBe('c');
  });

  it('les flèches du clavier font le tour des options', () => {
    const fixture = TestBed.createComponent(SegmentedComponent);
    fixture.componentRef.setInput('options', options);
    fixture.componentRef.setInput('value', 'c');
    fixture.detectChanges();
    const first = fixture.nativeElement.querySelector('button') as HTMLButtonElement;
    first.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    expect(fixture.componentInstance.value()).toBe('a');
  });
});
