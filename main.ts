import { App, Notice, Plugin, PluginSettingTab, Setting, TFile } from 'obsidian';
import type moment from "moment";

declare global {
  interface Window {
    moment: typeof moment;
  }
}

enum Mode {
  CTime = 'ctime',
  MTime = 'mtime'
}

enum Location {
  Tab = 'tab',
  Split = 'split'
}

interface WeeklyReviewSettings {
	daysAgo: number;
	mode: Mode;
	location: Location;
	lastReview: string | null;
}

const DEFAULT_SETTINGS: WeeklyReviewSettings = {
	daysAgo: 7,
	mode: Mode.CTime,
	location: Location.Tab,
	lastReview: null
}

export default class WeeklyReview extends Plugin {
	settings: WeeklyReviewSettings;

  async startReview(lookbackInDays:number, mode:Mode, location:Location) {
		// A cleared settings box can persist NaN, which makes every
		// comparison below false and silently opens nothing.
		const days = Number.isFinite(lookbackInDays) && lookbackInDays >= 1
			? Math.floor(lookbackInDays)
			: DEFAULT_SETTINGS.daysAgo;

    const start = window.moment().startOf('day').subtract(days, "days");
    const recentFiles = this.app.vault.getMarkdownFiles()
			.filter(f => start.isBefore(window.moment(f.stat[mode])))
			.sort((a, b) => b.stat[mode] - a.stat[mode]);

		// if the mode is ctime, say created
		// otherwise say modified
		const modeString = mode === Mode.CTime ? 'created' : 'modified';

    new Notice(`Opening ${recentFiles.length} files ${modeString} in the last ${days} days.`);

		const splitLeaf = location === Location.Split
			? this.app.workspace.getLeaf('split')
			: null;

		// getLeaf('split') does not activate the new leaf, and getLeaf('tab')
		// picks its tab group from the most recently active leaf. Without this
		// every file after the first would open back in the original group.
		if (splitLeaf) {
			this.app.workspace.setActiveLeaf(splitLeaf, { focus: false });
		}

		// Open one file at a time. Obsidian reuses a tab whose view is still
		// the empty "New tab" page, so firing these off concurrently makes
		// every file land in the same leaf and clobber the previous one.
		let failures = 0;
		for (let i = 0; i < recentFiles.length; i++) {
			// Re-resolve the path: the snapshot above goes stale if a sync
			// deletes or renames a file while the review is running.
			const file = this.app.vault.getAbstractFileByPath(recentFiles[i].path);
			if (!(file instanceof TFile)) continue;

			try {
				const leaf = (i === 0 && splitLeaf)
					? splitLeaf
					: this.app.workspace.getLeaf('tab');
				await leaf.openFile(file, { active: false });
			} catch (e) {
				failures++;
				console.error(`Weekly Review: failed to open ${file.path}`, e);
			}
		}

		// Let Obsidian know the split is the tab group we want to be active.
		if (splitLeaf) {
			this.app.workspace.setActiveLeaf(splitLeaf, { focus: true });
		}

		if (failures) {
			new Notice(`Weekly Review: ${failures} file(s) could not be opened.`);
		}

		this.settings.lastReview = new Date().toISOString();
		await this.saveSettings();
  }

  async onload() {
		await this.loadSettings();

		// This adds a simple command that can be triggered anywhere
		this.addCommand({
			id: 'Start Review',
			name: 'Start Review',
			callback: () => {
        this.startReview(this.settings.daysAgo, this.settings.mode, this.settings.location);
      }
		});

    // TODO Add a command that will prompt you for the number of days for this Review
    
    // TODO Add a command that will begin a new review with the starting day being the day after the last review

    // This adds a settings tab so the user can configure various aspects of the plugin
		this.addSettingTab(new WeeklyReviewSettingTab(this.app, this));
	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}
}

class WeeklyReviewSettingTab extends PluginSettingTab {
	plugin: WeeklyReview;

	constructor(app: App, plugin: WeeklyReview) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const {containerEl} = this;

		containerEl.empty();

		containerEl.createEl('h2', {text: 'Settings for Weekly Review'});
		const lastReview = this.plugin.settings.lastReview;
		containerEl.createEl('h3', {text: lastReview
			? 'Last Review was on: ' + window.moment(lastReview).format('MMMM Do, YYYY h:mma')
			: 'Last Review was on: Never'});

		new Setting(containerEl)
			.setName('How many days to show?')
			.setDesc('Typically this is 7')
			.addText(text => text
				.setPlaceholder('Days')
				.setValue(this.plugin.settings.daysAgo.toString())
				.onChange(async (value) => {
					// Fires on every keystroke — don't persist a half-typed
					// or empty box as NaN.
					const parsed = parseInt(value, 10);
					if (!Number.isFinite(parsed) || parsed < 1) return;
					this.plugin.settings.daysAgo = parsed;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('Mode')
			.setDesc('Would you like the plugin to return only newly created files or all files that have been recently modified?')
			.addDropdown((dropdown) => {
					dropdown.addOption(Mode.CTime, 'Recently Created');
					dropdown.addOption(Mode.MTime, 'Recently Modified');
					dropdown.setValue(this.plugin.settings.mode)
					dropdown.onChange(async (value:Mode) => {
						this.plugin.settings.mode = value;
						await this.plugin.saveSettings();
					});
			});
		
		new Setting(containerEl)
			.setName('Location')
			.setDesc('Would you like to open the review in the current tab or a new split?')
			.addDropdown((dropdown) => {
					dropdown.addOption(Location.Tab, 'Current Tab');
					dropdown.addOption(Location.Split, 'New Split');
					dropdown.setValue(this.plugin.settings.location)
					dropdown.onChange(async (value:Location) => {
						this.plugin.settings.location = value;
						await this.plugin.saveSettings();
					});
			});
	}
}
