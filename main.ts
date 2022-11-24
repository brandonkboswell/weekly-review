import { App, Editor, MarkdownView, Modal, Notice, Plugin, PluginSettingTab, Setting } from 'obsidian';

// Remember to rename these classes and interfaces!

interface WeeklyReviewSettings {
	mySetting: string;
}

const DEFAULT_SETTINGS: WeeklyReviewSettings = {
	daysAgo: 7
}

export default class WeeklyReview extends Plugin {
	settings: WeeklyReviewSettings;

	async onload() {
		await this.loadSettings();

		// This adds a simple command that can be triggered anywhere
		this.addCommand({
			id: 'Start Review',
			name: 'Start Review',
			callback: () => {
				const files = this.app.vault.getMarkdownFiles();

				let start = moment(moment().startOf('day')).subtract(this.settings.daysAgo, "days");
				let recentFiles = files.filter(f => start.isBefore(moment(f.stat.ctime)));

				new Notice(`Opening ${recentFiles.length} files created in the last ${this.settings.daysAgo} days.`);

				recentFiles.forEach((f) => {
					let leaf = app.workspace.createLeafInTabGroup();
					leaf.openFile(f)
				})
			}
		});

		// This adds a settings tab so the user can configure various aspects of the plugin
		this.addSettingTab(new WeeklyReviewSettingTab(this.app, this));
	}

	onunload() {

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
	}
}
