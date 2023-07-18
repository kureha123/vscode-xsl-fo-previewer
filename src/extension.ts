import * as vscode from 'vscode';
import * as childProc from "child_process";
import * as handlebars from "handlebars";
import * as fs from "fs";

let viewing = false;

export function activate(context: vscode.ExtensionContext) {
	let previewBtn = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 0);
	previewBtn.command = "vscode-xsl-fo-previewer.preview";
	previewBtn.text = "XSL-FO可視化";
	context.subscriptions.push(previewBtn);
	previewBtn.show();

	context.subscriptions.push(vscode.commands.registerCommand('vscode-xsl-fo-previewer.preview', () => {
		if (vscode.window.activeTextEditor?.document.uri.path === undefined) {
			return;
		}

		if (!viewing) {
			let panel = vscode.window.createWebviewPanel("fo-preview", "preview", vscode.ViewColumn.Beside);
			panel.webview.html = "生成中。。。";

			let foFilePath = vscode.window.activeTextEditor?.document.uri.path;
			let interval = vscode.workspace.getConfiguration("foPreviewer").get<number>("interval");
			let updateProc = childProc.spawn("java", ["-Dfile.encoding=UTF-8", "-jar", 'vscode-fop.jar', foFilePath, interval?.toString() ?? "1000"], { cwd: context.extensionPath + "/fop" });

			let previewList : string[] = [];
			let bufferList : Buffer[] = [];

			updateProc.stdout.on("data", function (data: Buffer) {
				let endFileSymbol = '\n'.charCodeAt(0);
				let endCreateSymbol = '\t'.charCodeAt(0);
				
				let start : number = 0;
				data.forEach(function (value, index, array) {
					if (value === endFileSymbol) {
						let last = data.slice(0, index);
						bufferList.push(last);
						start = index + 1;
						let result = Buffer.concat(bufferList);
						previewList.push(result.toString());
						bufferList = [];
					}
					else if (value === endCreateSymbol) {
						panel.webview.html = createPreview(context.extension.extensionPath + "/web", previewList);
						previewList = [];
					}
					else if (index === array.length - 1) {
						bufferList.push(data.slice(start));
					}
				});
			});

			updateProc.on("close", function () {
				panel.dispose();
			});

			updateProc.stderr.on("data", function (data: Buffer) {
				panel.webview.html = data.toString();
				console.debug(data.toString());
			});

			panel.onDidDispose(function () {
				viewing = false;
				updateProc.stdin.write("q");
				updateProc.kill();
			});

			viewing = true;
		}
		else {
			vscode.window.showInformationMessage("プレビューはすでに起動しています。");
		}
	}));
}

// This method is called when your extension is deactivated
export function deactivate() { }

function createPreview(templateDir: string, imageList: string[]) {
	let template = handlebars.compile(fs.readFileSync(templateDir + "/preview.hbs", { encoding: "utf-8" }));
	let context = {
		"imageList": imageList
	};
	let result = template(context);
	return result;
}
