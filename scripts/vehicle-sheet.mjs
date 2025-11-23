import SystemUtils from '/systems/cyberpunk-red-core/modules/utils/cpr-systemUtils.js';

export class VehicleSheet extends ActorSheet {
  
  // VAS-DEFAULTS-001
  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      classes: ["cyberpunk-red", "sheet", "actor", "vas-vehicle"],
      template: "modules/mmutons-cyberpunk-red-vas/templates/vehicle-sheet.hbs",
      width: 820,
      height: 750,
      tabs: [{navSelector: ".tabs", contentSelector: ".sheet-body", initial: "main"}],
      dragDrop: [{dragSelector: ".item-list .item", dropSelector: null}]
    });
  }

  // VAS-GETDATA-001
  async getData(options) {
    const context = await super.getData(options);
    
    // Initialize using flags
    if (!this.actor.getFlag('mmutons-cyberpunk-red-vas', 'positions')) {
      await this.actor.setFlag('mmutons-cyberpunk-red-vas', 'positions', []);
    }
    
    // Prepare data
    context.positions = await this._preparePositions();
    context.weapons = this.actor.items.filter(i => i.type === 'weapon');
    context.armor = this.actor.items.filter(i => i.type === 'armor');
    
    // Filter cargo - exclude weapons, armor, skills, roles, critical injuries, cyberware, programs
    const excludedTypes = ['weapon', 'armor', 'skill', 'role', 'criticalInjury', 'cyberware', 'cyberdeck', 'netarch', 'program'];
    const cargoItems = this.actor.items.filter(i => !excludedTypes.includes(i.type));
    
    // Sort cargo by category and alphabetically
    context.cargoByCategory = this._sortCargoByCategory(cargoItems);
    
    // Prepare mounted upgrades
    context.mountedUpgrades = this._prepareMountedUpgrades();
    
    context.isOwner = this.actor.isOwner;
    context.editable = this.isEditable;
    
    return context;
  }

// VAS-SORTCARGO-001
  _sortCargoByCategory(cargoItems) {
    if (!cargoItems || cargoItems.length === 0) return null;
    
    // Group by type
    const grouped = {};
    cargoItems.forEach(item => {
      const type = item.type;
      if (!grouped[type]) {
        grouped[type] = [];
      }
      grouped[type].push(item);
    });
    
    // Sort categories alphabetically
    const sortedCategories = Object.keys(grouped).sort();
    
    // Build result array
    const result = sortedCategories.map(category => {
      // Sort items within category alphabetically by name
      const sortedItems = grouped[category].sort((a, b) => 
        a.name.localeCompare(b.name)
      );
      
      // Capitalize category name
      const categoryName = category.charAt(0).toUpperCase() + category.slice(1);
      
      return {
        categoryName: categoryName,
        items: sortedItems
      };
    });
    
    return result;
  }

  // VAS-PREPMOUNTED-001
  _prepareMountedUpgrades() {
    const upgrades = this.actor.items.filter(i => 
      i.type === 'itemUpgrade' && 
      i.getFlag('mmutons-cyberpunk-red-vas', 'mounted')
    );
    
    return upgrades.map(upgrade => ({
      id: upgrade.id,
      name: upgrade.name,
      img: upgrade.img,
      description: upgrade.system.description?.value || upgrade.system.description || ''
    }));
  }

  // VAS-PREPPOS-001
  async _preparePositions() {
    const positions = this.actor.getFlag('mmutons-cyberpunk-red-vas', 'positions') || [];
    const prepared = [];
    
    for (const pos of positions) {
      const occupants = [];
      
      for (const uuid of (pos.occupants || [])) {
        try {
          const actor = await fromUuid(uuid);
          if (actor && actor.testUserPermission(game.user, "OBSERVER")) {
            occupants.push({
              uuid: uuid,
              id: actor.id,
              name: actor.name,
              img: actor.img,
              type: actor.type,
              hp: actor.system.derivedStats?.hp?.value || 0,
              hpMax: actor.system.derivedStats?.hp?.max || 0
            });
          }
        } catch(e) {
          console.warn(`VAS | Occupant ${uuid} not found`, e);
        }
      }
      
      const assignedWeapons = this.actor.items.filter(item =>
        item.type === 'weapon' && item.getFlag('mmutons-cyberpunk-red-vas', 'mountedPosition') === pos.id
      );
      
      const maxOccupants = pos.maxOccupants || 1;
      
      prepared.push({
        ...pos,
        occupants: occupants,
        hasOccupants: occupants.length > 0,
        isFull: occupants.length >= maxOccupants,
        isCrammed: occupants.length > maxOccupants,
        weapons: assignedWeapons,
        hasWeapons: assignedWeapons.length > 0,
        skillsList: (pos.skills || '').split(',').map(s => s.trim()).filter(s => s),
        bulletproofGlass: pos.bulletproofGlass || false,
        glassHp: pos.glassHp || 0,
        glassHpMax: pos.glassHpMax || 0
      });
    }
    
    return prepared.sort((a, b) => (a.order || 0) - (b.order || 0));
  }

  // VAS-LISTENERS-001
  activateListeners(html) {
    super.activateListeners(html);
    
    html.find('.item-edit').click(this._onItemEdit.bind(this));
    html.find('.occupant-view').click(this._onOccupantView.bind(this));
    html.find('.select-token').click(this._onSelectToken.bind(this));
    html.find('.weapon-sheet-btn').click(this._onWeaponSheet.bind(this));
    html.find('.weapon-action-icon[data-action="changeAmmo"]').click(this._onChangeAmmo.bind(this));
    html.find('.weapon-action-icon[data-action="reload"]').click(this._onReload.bind(this));
    html.find('.position-weapons-compact .rollable').click(this._onWeaponRoll.bind(this));
    html.find('.position-skills .skill-tag.rollable').click(this._onSkillRoll.bind(this));
	html.find('.glass-hp').click(this._onGlassHpClick.bind(this));
	html.find('.upgrade-mount').click(this._onUpgradeMount.bind(this));
    html.find('.upgrade-unmount').click(this._onUpgradeUnmount.bind(this));
    html.find('.upgrade-view').click(this._onItemEdit.bind(this));
    
    // Drag and drop for occupants
    html.find('.occupant-item.draggable').each((i, el) => {
      el.addEventListener('dragstart', this._onOccupantDragStart.bind(this));
    });
    html.find('.drop-zone').each((i, el) => {
      el.addEventListener('dragover', this._onOccupantDragOver.bind(this));
      el.addEventListener('drop', this._onOccupantDrop.bind(this));
    });
    
    if (!this.isEditable) return;
    
    html.find('button.item-create').click(this._onItemCreate.bind(this));
    html.find('.item-delete').click(this._onItemDelete.bind(this));
    html.find('button.position-add').click(this._onPositionAdd.bind(this));
    html.find('.position-edit').click(this._onPositionEdit.bind(this));
    html.find('.position-delete').click(this._onPositionDelete.bind(this));
    html.find('.occupant-remove').click(this._onOccupantRemove.bind(this));
    html.find('.weapon-mount').click(this._onWeaponMount.bind(this));
    html.find('.weapon-unmount').click(this._onWeaponUnmount.bind(this));
    html.find('.armor-equip').click(this._onArmorEquip.bind(this));
    html.find('.fire-checkbox').click(this._onFireCheckboxToggle.bind(this));
    
    console.log('VAS | All listeners activated');
  }

  // VAS-ITEMEDIT-001
  _onItemEdit(event) {
    event.preventDefault();
    const itemId = event.currentTarget.closest('[data-item-id]')?.dataset.itemId;
    const item = this.actor.items.get(itemId);
    item?.sheet.render(true);
  }

  // VAS-WEAPSHEET-001
  _onWeaponSheet(event) {
    event.preventDefault();
    const itemId = event.currentTarget.dataset.itemId;
    const item = this.actor.items.get(itemId);
    if (item) item.sheet.render(true);
  }

  // VAS-OCCVIEW-001
  _onOccupantView(event) {
    event.preventDefault();
    const uuid = event.currentTarget.dataset.occupantUuid;
    fromUuid(uuid).then(actor => actor?.sheet.render(true));
  }

  // VAS-SELECTTOKEN-001
  async _onSelectToken(event) {
    event.preventDefault();
    const posId = event.currentTarget.dataset.positionId;
    
    const controlled = canvas.tokens.controlled;
    if (controlled.length === 0) {
      ui.notifications.warn('Please select a token first');
      return;
    }
    
    if (controlled.length > 1) {
      ui.notifications.warn('Please select only one token');
      return;
    }
    
    const token = controlled[0];
    const actor = token.actor;
    
    if (!actor) {
      ui.notifications.error('Selected token has no actor');
      return;
    }
    
    const positions = foundry.utils.deepClone(
      this.actor.getFlag('mmutons-cyberpunk-red-vas', 'positions') || []
    );
    
    // Remove actor from all other positions
    positions.forEach(p => {
      if (!p.occupants) p.occupants = [];
      p.occupants = p.occupants.filter(u => u !== actor.uuid);
    });
    
    // Add to target position (allow up to 2)
    const targetPos = positions.find(p => p.id === posId);
    if (targetPos) {
      if (!targetPos.occupants) targetPos.occupants = [];
      
      if (targetPos.occupants.length >= 2) {
        ui.notifications.warn('Position cannot fit more than 2 occupants!');
        return;
      }
      
      targetPos.occupants.push(actor.uuid);
      
      if (targetPos.occupants.length > (targetPos.maxOccupants || 1)) {
        ui.notifications.warn(`${actor.name} assigned (Position is crammed!)`);
      } else {
        ui.notifications.info(`${actor.name} assigned to position`);
      }
      
      await this.actor.setFlag('mmutons-cyberpunk-red-vas', 'positions', positions);
	  
	  // Grant vehicle access with debounce
    if (!this._pendingAccessUpdates) this._pendingAccessUpdates = {};
    clearTimeout(this._pendingAccessUpdates[actor.uuid]);
    this._pendingAccessUpdates[actor.uuid] = setTimeout(() => {
      this._grantVehicleAccess(actor.uuid, posId);
      delete this._pendingAccessUpdates[actor.uuid];
    }, 500);
    }
  }

  // VAS-ITEMCREATE-001
  async _onItemCreate(event) {
    event.preventDefault();
    const type = event.currentTarget.dataset.type;
    
    const itemData = {
      name: `New ${type.capitalize()}`,
      type: type,
      system: {}
    };
    
    return await Item.create(itemData, {parent: this.actor});
  }

  // VAS-ITEMDELETE-001
  async _onItemDelete(event) {
    event.preventDefault();
    event.stopPropagation();
    
    const itemId = event.currentTarget.closest('[data-item-id]')?.dataset.itemId;
    if (!itemId) {
      console.warn('VAS | No item ID found for delete');
      return;
    }
    
    const item = this.actor.items.get(itemId);
    
    if (item) {
      const confirmed = await Dialog.confirm({
        title: 'Delete Item',
        content: `<p>Delete ${item.name}?</p>`
      });
      
      if (confirmed) {
        await item.delete();
        ui.notifications.info(`${item.name} deleted.`);
      }
    }
  }

  // VAS-POSADD-001
  async _onPositionAdd(event) {
    event.preventDefault();
    event.stopPropagation();
    
    const positions = foundry.utils.deepClone(
      this.actor.getFlag('mmutons-cyberpunk-red-vas', 'positions') || []
    );
    
    const newPosition = {
      id: foundry.utils.randomID(),
      name: 'New Position',
      order: positions.length + 1,
      occupants: [],
      skills: '',
      maxOccupants: 1,
      canControlWeapons: false
    };
    
    positions.push(newPosition);
    
    await this.actor.setFlag('mmutons-cyberpunk-red-vas', 'positions', positions);
    
    ui.notifications.info('Position added! Click gear icon to configure.');
  }

  // VAS-POSEDIT-001
  async _onPositionEdit(event) {
    event.preventDefault();
    const posId = event.currentTarget.dataset.positionId;
    const pos = this.actor.getFlag('mmutons-cyberpunk-red-vas', 'positions').find(p => p.id === posId);
    if (!pos) return;
    
    new Dialog({
      title: `Edit Position: ${pos.name}`,
      content: `
        <form>
          <div class="form-group">
            <label>Position Name</label>
            <input type="text" name="name" value="${pos.name}"/>
          </div>
          <div class="form-group">
            <label>Display Order</label>
            <input type="number" name="order" value="${pos.order || 1}" min="1"/>
          </div>
          <div class="form-group">
            <label>Max Occupants</label>
            <input type="number" name="maxOccupants" value="${pos.maxOccupants || 1}" min="1"/>
          </div>
          <div class="form-group">
            <label>
              <input type="checkbox" name="canControlWeapons" ${pos.canControlWeapons ? 'checked' : ''}/>
              Can Control Weapons
            </label>
          </div>
          <div class="form-group">
            <label>
              <input type="checkbox" name="bulletproofGlass" class="glass-checkbox" ${pos.bulletproofGlass ? 'checked' : ''}/>
              Bulletproof Glass
            </label>
          </div>
          <div class="form-group glass-hp-group" style="display: ${pos.bulletproofGlass ? 'block' : 'none'};">
            <label>Glass HP Max</label>
            <input type="number" name="glassHpMax" value="${pos.glassHpMax || 0}" min="0"/>
          </div>
          <div class="form-group">
            <label>Skills (comma-separated)</label>
            <input type="text" name="skills" value="${pos.skills || ''}" placeholder="Evasion"/>
          </div>
		  <div class="form-group">
            <label>
              <input type="checkbox" name="grantsTokenControl" ${pos.grantsTokenControl ? 'checked' : ''}/>
              Grants Vehicle Token Control
            </label>
          </div>
        </form>
      `,
      buttons: {
        save: {
          icon: '<i class="fas fa-save"></i>',
          label: 'Save',
          callback: async (html) => {
            const form = html[0].querySelector('form');
            const fd = new FormDataExtended(form).object;
            
            const positions = foundry.utils.deepClone(
              this.actor.getFlag('mmutons-cyberpunk-red-vas', 'positions')
            );
            const position = positions.find(p => p.id === posId);
            
            if (position) {
              position.name = fd.name;
              position.order = Number(fd.order);
              position.maxOccupants = Number(fd.maxOccupants);
              position.canControlWeapons = fd.canControlWeapons;
              position.skills = fd.skills;
              position.bulletproofGlass = fd.bulletproofGlass;
			  position.grantsTokenControl = fd.grantsTokenControl;
              
              if (fd.bulletproofGlass) {
                const newMax = Number(fd.glassHpMax);
                position.glassHpMax = newMax;
                // Initialize glassHp if not set, or cap it to new max
                if (!position.glassHp) {
                  position.glassHp = newMax;
                } else {
                  position.glassHp = Math.min(position.glassHp, newMax);
                }
              } else {
                position.glassHp = 0;
                position.glassHpMax = 0;
              }
              
              await this.actor.setFlag('mmutons-cyberpunk-red-vas', 'positions', positions);
            }
          }
        },
        cancel: {label: 'Cancel'}
      },
      default: 'save',
      render: (html) => {
        // Toggle glass HP field visibility
        html.find('.glass-checkbox').change((e) => {
          const glassGroup = html.find('.glass-hp-group');
          if (e.target.checked) {
            glassGroup.show();
          } else {
            glassGroup.hide();
          }
        });
      }
    }).render(true);
  }

  // VAS-POSDEL-001
  async _onPositionDelete(event) {
    event.preventDefault();
    const posId = event.currentTarget.dataset.positionId;
    
    const confirmed = await Dialog.confirm({
      title: 'Delete Position',
      content: '<p>Delete this position?</p>'
    });
    
    if (!confirmed) return;
    
    const positions = (
      this.actor.getFlag('mmutons-cyberpunk-red-vas', 'positions') || []
    ).filter(p => p.id !== posId);
    
    await this.actor.setFlag('mmutons-cyberpunk-red-vas', 'positions', positions);
  }

  // VAS-OCCREM-001
  async _onOccupantRemove(event) {
    event.preventDefault();
    const posId = event.currentTarget.dataset.positionId;
    const occUuid = event.currentTarget.dataset.occupantUuid;
    
    const positions = foundry.utils.deepClone(
      this.actor.getFlag('mmutons-cyberpunk-red-vas', 'positions') || []
    );
    const pos = positions.find(p => p.id === posId);
    
    if (pos) {
      pos.occupants = (pos.occupants || []).filter(u => u !== occUuid);
      await this.actor.setFlag('mmutons-cyberpunk-red-vas', 'positions', positions);
	  
	  // Revoke vehicle access with debounce
    if (!this._pendingAccessUpdates) this._pendingAccessUpdates = {};
    clearTimeout(this._pendingAccessUpdates[occUuid]);
    this._pendingAccessUpdates[occUuid] = setTimeout(() => {
      this._revokeVehicleAccess(occUuid);
      delete this._pendingAccessUpdates[occUuid];
    }, 500);
    }
  }

  // VAS-WEAPMOUNT-001
  async _onWeaponMount(event) {
    event.preventDefault();
    const itemId = event.currentTarget.dataset.itemId;
    const item = this.actor.items.get(itemId);
    if (!item) return;
    
    const positions = this.actor.getFlag('mmutons-cyberpunk-red-vas', 'positions').filter(p => p.canControlWeapons);
    
    if (positions.length === 0) {
      ui.notifications.warn('No weapon-capable positions available');
      return;
    }
    
    const buttons = {};
    positions.forEach(pos => {
      buttons[pos.id] = {
        label: pos.name,
        callback: async () => {
          await item.setFlag('mmutons-cyberpunk-red-vas', 'mountedPosition', pos.id);
          ui.notifications.info(`${item.name} mounted to ${pos.name}`);
        }
      };
    });
    buttons.cancel = {label: 'Cancel'};
    
    new Dialog({
      title: `Mount ${item.name}`,
      content: '<p>Select position:</p>',
      buttons: buttons
    }).render(true);
  }

  // VAS-WEAPUNMOUNT-001
  async _onWeaponUnmount(event) {
    event.preventDefault();
    const itemId = event.currentTarget.dataset.itemId;
    const item = this.actor.items.get(itemId);
    if (item) {
      await item.unsetFlag('mmutons-cyberpunk-red-vas', 'mountedPosition');
      ui.notifications.info(`${item.name} unmounted`);
    }
  }

  // VAS-ACTDRIVE-001
  async _onActionDrive(event) {
    event.preventDefault();
    const posId = event.currentTarget.dataset.positionId;
    await this._rollPositionSkill(posId, 'Drive Land Vehicle');
  }

  // VAS-ACTEVADE-001
  async _onActionEvade(event) {
    event.preventDefault();
    const posId = event.currentTarget.dataset.positionId;
    await this._rollPositionSkill(posId, 'Evasion');
  }
  
  // VAS-FIREMODETOGGLE-001
async _onFireCheckboxToggle(event) {
  event.preventDefault();
  const weaponID = event.currentTarget.dataset.itemId;
  const firemode = event.currentTarget.dataset.fireMode;
  
  // Get the current flag for this weapon
  const flag = this.actor.getFlag('cyberpunk-red-core', `firetype-${weaponID}`);
  
  // Handle autofire DV table switching if on token sheet
  if (this.token !== null && firemode === 'autofire') {
    const weapon = this.actor.items.get(weaponID);
    const weaponDvTable = weapon.system.dvTable;
    const currentDvTable = weaponDvTable === '' 
      ? foundry.utils.getProperty(this.token, 'flags.cprDvTable')
      : weaponDvTable;
      
    if (typeof currentDvTable !== 'undefined') {
      const dvTable = currentDvTable.replace(' (Autofire)', '');
      const dvTables = await SystemUtils.GetDvTables();
      const afTable = dvTables.filter(table =>
        table.name.includes(dvTable) && table.name.includes('Autofire')
      );
      
      let newDvTable = currentDvTable;
      if (afTable.length > 0) {
        newDvTable = flag === firemode ? dvTable : afTable[0];
      }
      await this.token.update({ 'flags.cprDvTable': newDvTable });
    }
  }
  
  // Toggle the fire mode flag
  if (flag === firemode) {
    // Uncheck - remove flag
    await this.actor.unsetFlag('cyberpunk-red-core', `firetype-${weaponID}`);
  } else {
    // Check - set flag
    await this.actor.setFlag('cyberpunk-red-core', `firetype-${weaponID}`, firemode);
  }
}

// VAS-GETFIREMODE-001
  _getFireCheckbox(weaponID) {
    const box = this.actor.getFlag('cyberpunk-red-core', `firetype-${weaponID}`);
    if (box) {
      return box;
    }
    return 'attack'; // Default to normal attack
  }

  // VAS-CHANGEAMMO-001
  async _onChangeAmmo(event) {
    event.preventDefault();
    const itemId = event.currentTarget.dataset.itemId;
    const item = this.actor.items.get(itemId);
    if (!item) return;
    
    if (typeof item.load === 'function') {
      await item.load();
    } else {
      ui.notifications.warn('This weapon cannot change ammo');
    }
  }

  // VAS-RELOAD-001
  async _onReload(event) {
    event.preventDefault();
    const itemId = event.currentTarget.dataset.itemId;
    const item = this.actor.items.get(itemId);
    if (!item) return;
    
    if (typeof item.reload === 'function') {
      await item.reload();
    } else {
      ui.notifications.warn('This weapon cannot be reloaded');
    }
  }

  // VAS-WEAPONROLL-001
  async _onWeaponRoll(event) {
    event.preventDefault();
    event.stopPropagation();
    
    const itemId = event.currentTarget.dataset.itemId;
    const rollTypeFromButton = event.currentTarget.dataset.rollType;
    const item = this.actor.items.get(itemId);
    
    if (!item) return;
    
    const mountedPos = item.getFlag('mmutons-cyberpunk-red-vas', 'mountedPosition');
    if (!mountedPos) {
      ui.notifications.warn('Weapon is not mounted to a position');
      return;
    }
    
    const positions = this.actor.getFlag('mmutons-cyberpunk-red-vas', 'positions') || [];
    const position = positions.find(p => p.id === mountedPos);
    
    if (!position?.occupants?.length) {
      ui.notifications.warn('No operator in weapon position!');
      return;
    }
    
    const occupantActor = await fromUuid(position.occupants[0]);
    if (!occupantActor) {
      ui.notifications.error('Occupant actor not found!');
      return;
    }
    
    let rollType;
    if (rollTypeFromButton === 'attack') {
      rollType = this._getFireCheckbox(itemId);
    } else {
      rollType = 'damage';
    }
    
    let cprRoll = item.createRoll(rollType, occupantActor);
    
    const keepRolling = await cprRoll.handleRollDialog(event, occupantActor, item);
    if (!keepRolling) return;
    
    cprRoll = await item.confirmRoll(cprRoll);
    if (!cprRoll) return;
    
    await cprRoll.roll();
    
    if (Number.isInteger(cprRoll.luck) && cprRoll.luck > 0) {
      const luckStat = occupantActor.system.stats.luck.value;
      await occupantActor.update({
        'system.stats.luck.value': luckStat - (cprRoll.luck > luckStat ? luckStat : cprRoll.luck)
      });
    }
    
    const token = this.token === null ? null : this.token._id;
    const targetedTokens = canvas.tokens.controlled.map(t => t.id);
    
    cprRoll.entityData = {
      actor: occupantActor.id,
      token: token,
      tokens: targetedTokens,
      item: item.id
    };
    
    const CPRChat = await import('/systems/cyberpunk-red-core/modules/chat/cpr-chat.js');
    CPRChat.default.RenderRollCard(cprRoll);
  }
  
  // VAS-SKILLROLL-001
  async _onSkillRoll(event) {
    event.preventDefault();
    const positionId = event.currentTarget.dataset.positionId;
    const skillTitle = event.currentTarget.dataset.rollTitle;
    
    const pos = this.actor.getFlag('mmutons-cyberpunk-red-vas', 'positions')?.find(p => p.id === positionId);
    if (!pos?.occupants?.length) {
      ui.notifications.warn('No occupant in this position!');
      return;
    }
    
    const occupant = await fromUuid(pos.occupants[0]);
    if (!occupant) {
      ui.notifications.error('Occupant not found!');
      return;
    }
    
    // Find the skill by name
    const skill = occupant.items.find(i => 
      i.type === 'skill' && i.name === skillTitle
    );
    
    if (!skill) {
      ui.notifications.warn(`${occupant.name} doesn't have ${skillTitle} skill!`);
      return;
    }
    
    // Use the exact same pattern as weapon rolls
    let cprRoll = skill.createRoll('skill', occupant);
    
    const keepRolling = await cprRoll.handleRollDialog(event, occupant, skill);
    if (!keepRolling) return;
    
    cprRoll = await skill.confirmRoll(cprRoll);
    if (!cprRoll) return;
    
    await cprRoll.roll();
    
    // Handle luck if used
    if (Number.isInteger(cprRoll.luck) && cprRoll.luck > 0) {
      const luckStat = occupant.system.stats.luck.value;
      await occupant.update({
        'system.stats.luck.value': luckStat - (cprRoll.luck > luckStat ? luckStat : cprRoll.luck)
      });
    }
    
    // Set entity data
    const token = this.token === null ? null : this.token._id;
    const targetedTokens = canvas.tokens.controlled.map(t => t.id);
    
    cprRoll.entityData = {
      actor: occupant.id,
      token: token,
      tokens: targetedTokens,
      item: skill.id
    };
    
    // Render to chat
    const CPRChat = await import('/systems/cyberpunk-red-core/modules/chat/cpr-chat.js');
    CPRChat.default.RenderRollCard(cprRoll);
  }

  // VAS-ARMOREQUIP-001
  async _onArmorEquip(event) {
    event.preventDefault();
    const itemId = event.currentTarget.dataset.itemId;
    const item = this.actor.items.get(itemId);
    if (!item) return;
    
    const currentState = item.system.equipped || 'owned';
    const states = ['equipped', 'owned', 'carried'];
    const currentIndex = states.indexOf(currentState);
    const newState = states[(currentIndex + 1) % states.length];
    
    await item.update({'system.equipped': newState});
    
    // Update tracked armor in externalData for damage reduction
    if (newState === 'equipped') {
      // When equipping, update externalData with armor values
      if (item.system.isBodyLocation) {
        const bodySP = item.system.bodyLocation?.sp || 0;
        const bodyAblation = item.system.bodyLocation?.ablation || 0;
        await this.actor.update({
          'system.externalData.currentArmorBody.value': bodySP - bodyAblation,
          'system.externalData.currentArmorBody.max': bodySP,
          'system.externalData.currentArmorBody.id': itemId
        });
      }
      if (item.system.isHeadLocation) {
        const headSP = item.system.headLocation?.sp || 0;
        const headAblation = item.system.headLocation?.ablation || 0;
        await this.actor.update({
          'system.externalData.currentArmorHead.value': headSP - headAblation,
          'system.externalData.currentArmorHead.max': headSP,
          'system.externalData.currentArmorHead.id': itemId
        });
      }
    } else {
      // When unequipping, reset externalData
      if (item.system.isBodyLocation) {
        await this.actor.update({
          'system.externalData.currentArmorBody.value': 0,
          'system.externalData.currentArmorBody.max': 0,
          'system.externalData.currentArmorBody.id': null
        });
      }
      if (item.system.isHeadLocation) {
        await this.actor.update({
          'system.externalData.currentArmorHead.value': 0,
          'system.externalData.currentArmorHead.max': 0,
          'system.externalData.currentArmorHead.id': null
        });
      }
    }
  }

  // VAS-OCCUDRAGSTART-001
  _onOccupantDragStart(event) {
    const occupantUuid = event.currentTarget.dataset.occupantUuid;
    const positionId = event.currentTarget.dataset.positionId;
    event.dataTransfer.setData('text/plain', JSON.stringify({
      type: 'occupant',
      uuid: occupantUuid,
      fromPosition: positionId
    }));
  }

  // VAS-OCCUDRAGOVER-001
  _onOccupantDragOver(event) {
    event.preventDefault();
    event.currentTarget.classList.add('dragover');
  }

  // VAS-OCCUDROP-001
  async _onOccupantDrop(event) {
    event.preventDefault();
    event.currentTarget.classList.remove('dragover');
    
    const data = JSON.parse(event.dataTransfer.getData('text/plain'));
    if (data.type !== 'occupant') return;
    
    const toPositionId = event.currentTarget.dataset.positionId;
    const fromPositionId = data.fromPosition;
    
    if (toPositionId === fromPositionId) return;
    
    const positions = foundry.utils.deepClone(
      this.actor.getFlag('mmutons-cyberpunk-red-vas', 'positions') || []
    );
    
    // Remove from old position
    const fromPos = positions.find(p => p.id === fromPositionId);
    if (fromPos) {
      fromPos.occupants = (fromPos.occupants || []).filter(u => u !== data.uuid);
    }
    
    // Add to new position (allow up to 2)
    const toPos = positions.find(p => p.id === toPositionId);
    if (toPos) {
      if (!toPos.occupants) toPos.occupants = [];
      
      if (toPos.occupants.length >= 2) {
        ui.notifications.warn('Position cannot fit more than 2 occupants!');
        return;
      }
      
      toPos.occupants.push(data.uuid);
      
      if (toPos.occupants.length > (toPos.maxOccupants || 1)) {
        ui.notifications.warn('Position is now crammed!');
      }
    }
    
    await this.actor.setFlag('mmutons-cyberpunk-red-vas', 'positions', positions);
  }
  
// VAS-GLASSHPCLICK-001
  async _onGlassHpClick(event) {
    event.preventDefault();
    const posId = event.currentTarget.dataset.positionId;
    const pos = this.actor.getFlag('mmutons-cyberpunk-red-vas', 'positions')?.find(p => p.id === posId);
    if (!pos) return;
    
    new Dialog({
      title: `${pos.name} - Bulletproof Glass`,
      content: `
        <form>
          <div class="form-group">
            <label>Current HP: ${pos.glassHp}/${pos.glassHpMax}</label>
          </div>
          <div class="form-group">
            <label>Amount</label>
            <input type="number" name="amount" value="" autofocus/>
          </div>
        </form>
      `,
      buttons: {
        damage: {
          icon: '<i class="fas fa-heart-broken"></i>',
          label: 'Damage',
          callback: async (html) => {
            const amount = Number(html.find('[name="amount"]').val()) || 0;
            await this._updateGlassHp(posId, -amount);
          }
        },
        repair: {
          icon: '<i class="fas fa-wrench"></i>',
          label: 'Repair',
          callback: async (html) => {
            const amount = Number(html.find('[name="amount"]').val()) || 0;
            await this._updateGlassHp(posId, amount);
          }
        },
        cancel: {
          icon: '<i class="fas fa-times"></i>',
          label: 'Cancel'
        }
      },
      default: 'damage'
    }).render(true);
  }

  // VAS-UPDATEGLASSHP-001
  async _updateGlassHp(positionId, change) {
    const positions = foundry.utils.deepClone(
      this.actor.getFlag('mmutons-cyberpunk-red-vas', 'positions') || []
    );
    
    const position = positions.find(p => p.id === positionId);
    if (!position) return;
    
    const newHp = Math.max(0, Math.min(position.glassHpMax, position.glassHp + change));
    position.glassHp = newHp;
    
    await this.actor.setFlag('mmutons-cyberpunk-red-vas', 'positions', positions);
    
    const action = change > 0 ? 'repaired' : 'damaged';
    ui.notifications.info(`${position.name} glass ${action}: ${newHp}/${position.glassHpMax} HP`);
  }
  
  // VAS-UPGRADEMOUNT-001
  async _onUpgradeMount(event) {
    event.preventDefault();
    const itemId = event.currentTarget.dataset.itemId;
    const item = this.actor.items.get(itemId);
    if (!item) return;
    
    // Check if this is a vehicle upgrade by looking for vehicle type keywords in description
    const description = (item.system.description?.value || item.system.description || '').toLowerCase();
    const vehicleKeywords = ['bikes', 'jetskis', 'gyrocopters', 'groundcars', 'vehicles', 'aerozep', 'av-4', 'cabin cruiser', 'yacht'];
    
    const isVehicleUpgrade = vehicleKeywords.some(keyword => description.includes(keyword));
    
    if (!isVehicleUpgrade) {
      ui.notifications.warn('Incompatible Upgrade - This is not a vehicle upgrade.');
      return;
    }
    
    // Mount the upgrade
    await item.setFlag('mmutons-cyberpunk-red-vas', 'mounted', true);
    ui.notifications.info(`${item.name} mounted successfully!`);
  }

  // VAS-UPGRADEUNMOUNT-001
  async _onUpgradeUnmount(event) {
    event.preventDefault();
    const itemId = event.currentTarget.dataset.itemId;
    const item = this.actor.items.get(itemId);
    if (!item) return;
    
    await item.unsetFlag('mmutons-cyberpunk-red-vas', 'mounted');
    ui.notifications.info(`${item.name} unmounted.`);
  }
  
  // VAS-GETACTOROWNER-001
  _getActorOwner(document) {
    // Find the user who owns this actor or any of its active tokens.
    const actor = document?.actor ?? document;

    // Prefer token ownership (players may only have token control)
    const activeTokens = actor?.getActiveTokens?.(true) || [];
    if (document?.documentName === 'Token' && !activeTokens.includes(document)) {
      activeTokens.unshift(document);
    }

    const nonGmUsers = game.users.filter(user => !user.isGM);
    const gmUsers = game.users.filter(user => user.isGM);

    const checkOwners = (usersToCheck) => {
      for (const user of usersToCheck) {
        // Check token ownership first
        const hasTokenOwnership = activeTokens.some(token => token.document?.testUserPermission?.(user, "OWNER"));
        if (hasTokenOwnership) return user;

        // Fall back to actor ownership
        const hasActorOwnership = actor?.testUserPermission?.(user, "OWNER");
        if (hasActorOwnership) return user;
      }
      return null;
    };

    // Prioritize non-GM owners so seated players receive access instead of returning the GM
    return checkOwners(nonGmUsers) ?? checkOwners(gmUsers);

    return null;
  }

  // VAS-GRANTVEHICLEACCESS-001
  async _grantVehicleAccess(occupantUuid, positionId) {
    try {
      const occupantActor = await fromUuid(occupantUuid);
      if (!occupantActor) return;
      
      const user = this._getActorOwner(occupantActor);
      if (!user) return; // No user owns this actor (NPC or unassigned)
      if (user.isGM) return; // GMs already have all permissions
      
      const positions = this.actor.getFlag('mmutons-cyberpunk-red-vas', 'positions') || [];
      const position = positions.find(p => p.id === positionId);
      
      // Always grant OBSERVER permission on vehicle actor (for sheet access)
      let actorUpdates = {};
      const currentActorOwnership = this.actor.ownership || {};
      if ((currentActorOwnership[user.id] || 0) < CONST.DOCUMENT_OWNERSHIP_LEVELS.OBSERVER) {
        actorUpdates[`ownership.${user.id}`] = CONST.DOCUMENT_OWNERSHIP_LEVELS.OBSERVER;
        await this.actor.update(actorUpdates);
        console.log(`VAS | Granted OBSERVER to ${user.name} on vehicle actor`);
      }
      
      // Grant OWNER permission on vehicle token(s) if position allows (for token control)
      if (position?.grantsTokenControl) {
        const activeTokens = this.actor.getActiveTokens(true);
        const tokenDocs = activeTokens.map(t => t.document);

        if (tokenDocs.length === 0 && this.actor.prototypeToken) {
          // No active token - ensure prototype grants control for when it is placed later
          tokenDocs.push(this.actor.prototypeToken);
        }

        for (const tokenDoc of tokenDocs) {
          const currentTokenOwnership = tokenDoc.ownership || {};
          if ((currentTokenOwnership[user.id] || 0) < CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER) {
            const tokenUpdates = {
              [`ownership.${user.id}`]: CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER
            };
            await tokenDoc.update(tokenUpdates);
            console.log(`VAS | Granted OWNER to ${user.name} on vehicle token ${tokenDoc.name || tokenDoc.id} for position ${position.name}`);
          }
        }
      }
      
    } catch (error) {
      console.error('VAS | Error granting vehicle access:', error);
    }
  }

  // VAS-REVOKEVEHICLEACCESS-001
  async _revokeVehicleAccess(occupantUuid) {
    try {
      const occupantActor = await fromUuid(occupantUuid);
      if (!occupantActor) return;
      
      const user = this._getActorOwner(occupantActor);
      if (!user) return;
      if (user.isGM) return;
      
      // Check if this user has OTHER characters still in the vehicle
      const positions = this.actor.getFlag('mmutons-cyberpunk-red-vas', 'positions') || [];
      const allOccupantUuids = positions.flatMap(p => p.occupants || []);
      
      let hasOtherOccupants = false;
      for (const uuid of allOccupantUuids) {
        if (uuid === occupantUuid) continue;
        const otherActor = await fromUuid(uuid);
        if (otherActor && this._getActorOwner(otherActor)?.id === user.id) {
          hasOtherOccupants = true;
          break;
        }
      }
      
      // Only revoke if user has no other occupants in vehicle
      if (!hasOtherOccupants) {
        // Revoke actor permissions
        let actorUpdates = {};
        actorUpdates[`ownership.${user.id}`] = CONST.DOCUMENT_OWNERSHIP_LEVELS.NONE;
        await this.actor.update(actorUpdates);

        // Revoke token permissions (active tokens and prototype)
        const activeTokens = this.actor.getActiveTokens(true);
        const tokenDocs = activeTokens.map(t => t.document);

        if (tokenDocs.length === 0 && this.actor.prototypeToken) {
          tokenDocs.push(this.actor.prototypeToken);
        }

        for (const tokenDoc of tokenDocs) {
          const tokenUpdates = {
            [`ownership.${user.id}`]: CONST.DOCUMENT_OWNERSHIP_LEVELS.NONE
          };
          await tokenDoc.update(tokenUpdates);
        }

        console.log(`VAS | Revoked vehicle access from ${user.name}`);
      } else {
        console.log(`VAS | ${user.name} still has other occupants in vehicle - keeping permissions`);
      }
    } catch (error) {
      console.error('VAS | Error revoking vehicle access:', error);
    }
  }

  // VAS-DROP-001
  async _onDrop(event) {
    const data = TextEditor.getDragEventData(event);
    const allowed = Hooks.call("dropActorSheetData", this.actor, this, data);
    if (allowed === false) return;
    
    switch (data.type) {
      case "Actor":
        return this._onDropActor(event, data);
      case "Item":
        return this._onDropItem(event, data);
      default:
        return super._onDrop(event);
    }
  }

  // VAS-DROPACT-001
  async _onDropActor(event, data) {
    if (!this.actor.isOwner) return false;
    
    if (data.uuid === this.actor.uuid) {
      ui.notifications.warn('Cannot add vehicle as its own occupant!');
      return false;
    }
    
    const actor = await fromUuid(data.uuid);
    if (!actor) return false;
    
    const posElement = event.target.closest('[data-position-id]');
    if (!posElement) {
      ui.notifications.warn('Drop actor onto a position card');
      return false;
    }
    
    const posId = posElement.dataset.positionId;
    const positions = foundry.utils.deepClone(
      this.actor.getFlag('mmutons-cyberpunk-red-vas', 'positions') || []
    );
    
    positions.forEach(p => {
      if (!p.occupants) p.occupants = [];
      p.occupants = p.occupants.filter(u => u !== actor.uuid);
    });
    
    const targetPos = positions.find(p => p.id === posId);
    if (targetPos) {
      if (!targetPos.occupants) targetPos.occupants = [];
      
      if (targetPos.occupants.length >= (targetPos.maxOccupants || 1)) {
        ui.notifications.warn('Position is at maximum capacity');
        return false;
      }
      
      targetPos.occupants.push(actor.uuid);
    }
    
    await this.actor.setFlag('mmutons-cyberpunk-red-vas', 'positions', positions);
    ui.notifications.info(`${actor.name} assigned to position`);
    // Grant vehicle access with debounce
    if (!this._pendingAccessUpdates) this._pendingAccessUpdates = {};
    clearTimeout(this._pendingAccessUpdates[actor.uuid]);
    this._pendingAccessUpdates[actor.uuid] = setTimeout(() => {
      this._grantVehicleAccess(actor.uuid, posId);
      delete this._pendingAccessUpdates[actor.uuid];
    }, 500);
	
    return true;
  }

  // VAS-DROPITEM-001
  async _onDropItem(event, data) {
    if (!this.actor.isOwner) return false;
    const item = await Item.implementation.fromDropData(data);
    if (!item) return;
    if (item.actor?.id === this.actor.id) return this._onSortItem(event, item);
    return this._onDropItemCreate(item, event);
  }

  // VAS-DROPITEMCREATE-001
  async _onDropItemCreate(itemData, event) {
    itemData = itemData instanceof Array ? itemData : [itemData];
    return this.actor.createEmbeddedDocuments("Item", itemData);
  }
}