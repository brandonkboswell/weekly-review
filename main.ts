import { App, Notice, Plugin, PluginSettingTab, Setting, WorkspaceLeaf, TFile } from 'obsidian';
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
	lastReview: Date | null;
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
    const files = this.app.vault.getMarkdownFiles();

    const start = window.moment(window.moment().startOf('day')).subtract(lookbackInDays, "days");
    const recentFiles = files.filter(f => start.isBefore(window.moment(f.stat[mode]))).sort((a, b) => b?.stat[mode] - a?.stat[mode]);

		// if the mode is ctime, say created
		// otherwise say modified
		const modeString = mode === Mode.CTime ? 'created' : 'modified';

    new Notice(`Opening ${recentFiles.length} files ${modeString} in the last ${lookbackInDays} days.`);
		let index = 0;
		let split: WorkspaceLeaf | null = null;
		if (location === Location.Split) {
			split = await this.app.workspace.getLeaf('split')
		}

		await recentFiles.forEach(async (f) => {
			await setTimeout(async () => {
				console.log(`Opening ${f.path}`, split, location)

				// If this is the first file and we are splitting
				// open it in the split
				if (index === 0 && split) {
					await this.openFile(split, f)
				} else {
					await this.openFile(null, f)
				}

				index++;
			})
		})

		this.settings.lastReview = new Date();
		await this.saveSettings();
		console.log('Weekly Review Done!')
  }

	async openFile(existingLeaf: WorkspaceLeaf | null, file: TFile) {
		let leaf = existingLeaf;
		if (!leaf) {
			leaf = await this.app.workspace.getLeaf('tab')
		}

		const r = await leaf.openFile(file, { active: false })

		// If we are putting this in a new split, 
		// let's make sure Obsidian knows this 
		// is the tab group we want to be active
		if (existingLeaf) {
			await this.app.workspace.setActiveLeaf(leaf)
		}

		return r;
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
		containerEl.createEl('h3', {text: 'Last Review was on: ' + window.moment(this.plugin.settings.lastReview).format('MMMM Do, YYYY h:mma') || 'Never'});

		new Setting(containerEl)
			.setName('How many days to show?')
			.setDesc('Typically this is 7')
			.addText(text => text
				.setPlaceholder('Days')
				.setValue(this.plugin.settings.daysAgo.toString())
				.onChange(async (value) => {
					this.plugin.settings.daysAgo = parseInt(value);
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
