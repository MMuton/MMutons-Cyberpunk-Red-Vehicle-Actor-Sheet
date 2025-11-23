import { VehicleSheet } from './scripts/vehicle-sheet.mjs';

Hooks.once('init', () => {
  console.log('VAS | Initializing Vehicle Sheet Module');
});

Hooks.once('setup', () => {
  Actors.registerSheet('mmutons-cyberpunk-red-vas', VehicleSheet, {
    types: ['character'],
    makeDefault: false,
    label: 'Vehicle Sheet (VAS)'
  });
  console.log('VAS | Vehicle sheet registered for character actors');
});

Hooks.once('ready', () => {
  console.log('VAS | Module ready');
  ui.notifications.info('Vehicle Actor Sheet module loaded!');
});