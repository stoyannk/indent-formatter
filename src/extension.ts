import assert = require('assert');
import * as vscode from 'vscode';

const MAX_LOOKUP_LINES = 5;

// Experimental, simple formatter with the eventual goal to address
// the issue listed in https://github.com/microsoft/vscode/issues/36148
// The formatter should run on type and after the user pushes _enter_.
// Right now, as a proof of concept, it supports fixing IndentOutdent
// situations for C++.
class IndentFixer implements vscode.OnTypeFormattingEditProvider {
	provideOnTypeFormattingEdits(document: vscode.TextDocument,
		position: vscode.Position,
		ch: string,
		options: vscode.FormattingOptions,
		token: vscode.CancellationToken):
		vscode.ProviderResult<vscode.TextEdit[]>
	{
		// Support the construct
		// _something_ {
		//	*cursor here after _enter_*
		// }
		if (ch !== '\n' || (document.lineCount - 1 === position.line)) {
			return;
		}
		const lineBefore = document.lineAt(position.line - 1);
		const lineAfter = document.lineAt(position.line + 1);
		
		const firstCharAfter = lineAfter.firstNonWhitespaceCharacterIndex;
		if (firstCharAfter === lineAfter.text.length
			|| lineAfter.text[firstCharAfter] !== '}') {
			return;
		}

		const textLineBefore = lineBefore.text.trimEnd();
		if (textLineBefore.length === 0 || textLineBefore[textLineBefore.length - 1] !== '{') {
			return;
		}
		
		// Look for unbalanced ()
		const evalLine = (lineText: string): number => {
			let balance = 0;
			// TODO: The logic here is really primitive and doesn't take into account comments or litetrals
			for (let ch of lineText) {
				if (ch === '(') {
					balance += 1;
				} else if (ch === ')') {
					balance -= 1;
				}
			}
			return balance;
		};
		
		let balance = evalLine(textLineBefore);
		if (balance === 0) {
			return;
		}

		// We found a line with an opening curly brace and unbalanced braces,
		// we will try to find the prev line where the expression started and balances the brace
		let startLine : vscode.TextLine | undefined;
		for (let lineIndex = position.line - 2; (lineIndex >= 0) && (lineIndex >= position.line - MAX_LOOKUP_LINES); --lineIndex) {
			const line = document.lineAt(lineIndex);
			balance += evalLine(line.text);
			if (balance === 0) {
				startLine = line;
				break;
			}			
		}	

		if (startLine === undefined) {
			return;
		}

		assert(options.insertSpaces === true, "We only support spaces for indent in this proof of concept");
		let countSpaces = (lineText : string): number => {
			let counter = 0;
			for (let ch of lineText) {
				if (ch === ' ') {
					++counter;
				} else {
					break;
				}
			}
			return counter;
		};

		const startWs = countSpaces(startLine.text);
		const desiredCurrentLineWs = startWs + options.tabSize;
		
		const currentLinePrefixRange = new vscode.Range(document.lineAt(position.line).range.start, position);
		const currentLineEdit = new vscode.TextEdit(currentLinePrefixRange, " ".repeat(desiredCurrentLineWs));

		const nextLinePrefixRange = new vscode.Range(lineAfter.range.start, lineAfter.range.start.translate(undefined, lineAfter.firstNonWhitespaceCharacterIndex));
		const nextLineEdit = new vscode.TextEdit(nextLinePrefixRange, " ".repeat(startWs));

		return [currentLineEdit, nextLineEdit];
	}
}

export function activate(context: vscode.ExtensionContext) {
	vscode.languages.registerOnTypeFormattingEditProvider({ scheme: '*', language: 'cpp' }, new IndentFixer, "\n");
}

export function deactivate() {}
