/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 */

import {useLexicalComposerContext} from '@lexical/react/LexicalComposerContext';
import {$generateHtmlFromNodes} from '@lexical/html';
import {$convertToMarkdownString} from '@lexical/markdown';
import {$getRoot, $createParagraphNode, $createTextNode} from 'lexical';
import {useEffect} from 'react';
import {PLAYGROUND_TRANSFORMERS} from '../MarkdownTransformers';

declare global {
  interface Window {
    Penpal?: any;
  }
}

export default function PenpalPlugin(): null {
  const [editor] = useLexicalComposerContext();

  useEffect(() => {
    // Check if we're in an iframe
    const isInIframe = window.self !== window.top;

    if (!isInIframe) {
      console.log('[PenpalPlugin] Not in iframe, skipping Penpal setup');
      return;
    }

    // Add iframe-mode class to body for styling
    document.body.classList.add('iframe-mode');

    // Check URL params for mode
    const urlParams = new URLSearchParams(window.location.search);
    const mode = urlParams.get('mode'); // 'minimal' or 'clean'
    if (mode === 'minimal' || mode === 'clean') {
      document.body.classList.add(mode);
    }

    // Check if Penpal is loaded
    if (!window.Penpal) {
      console.warn('[PenpalPlugin] Penpal not loaded. Add <script src="https://unpkg.com/penpal@^7/dist/penpal.min.js"></script> to index.html');
      return;
    }

    console.log('[PenpalPlugin] Setting up Penpal connection...');

    const {WindowMessenger, connect} = window.Penpal;

    const messenger = new WindowMessenger({
      remoteWindow: window.parent,
      allowedOrigins: ['*'], // In production, specify exact origins
    });

    let isUpdatingFromParent = false;

    const connection = connect({
      messenger,
      methods: {
        // Get current content as plain text
        getContent(): Promise<string> {
          return new Promise((resolve) => {
            editor.getEditorState().read(() => {
              const root = $getRoot();
              resolve(root.getTextContent());
            });
          });
        },

        // Set content as plain text
        setContent(content: string): Promise<boolean> {
          return new Promise((resolve) => {
            isUpdatingFromParent = true;
            editor.update(() => {
              const root = $getRoot();
              root.clear();
              const paragraph = $createParagraphNode();
              paragraph.append($createTextNode(content));
              root.append(paragraph);
              resolve(true);
            });
            setTimeout(() => {
              isUpdatingFromParent = false;
            }, 100);
          });
        },

        // Clear all content
        clear(): Promise<boolean> {
          return new Promise((resolve) => {
            isUpdatingFromParent = true;
            editor.update(() => {
              const root = $getRoot();
              root.clear();
              const paragraph = $createParagraphNode();
              root.append(paragraph);
              resolve(true);
            });
            setTimeout(() => {
              isUpdatingFromParent = false;
            }, 100);
          });
        },

        // Focus the editor
        focus(): Promise<boolean> {
          editor.focus();
          return Promise.resolve(true);
        },

        // Get editor state as JSON
        getEditorState(): Promise<any> {
          return new Promise((resolve) => {
            const state = editor.getEditorState().toJSON();
            resolve(state);
          });
        },

        // Set editor state from JSON
        setEditorState(stateJson: any): Promise<boolean> {
          return new Promise((resolve) => {
            try {
              isUpdatingFromParent = true;
              const newState = editor.parseEditorState(stateJson);
              editor.setEditorState(newState);
              setTimeout(() => {
                isUpdatingFromParent = false;
              }, 100);
              resolve(true);
            } catch (error) {
              console.error('[PenpalPlugin] Error setting editor state:', error);
              resolve(false);
            }
          });
        },

        // Get content as HTML
        getHTML(): Promise<string> {
          return new Promise((resolve) => {
            editor.getEditorState().read(() => {
              const html = $generateHtmlFromNodes(editor, null);
              resolve(html);
            });
          });
        },

        // Get content as Markdown
        getMarkdown(): Promise<string> {
          return new Promise((resolve) => {
            editor.getEditorState().read(() => {
              const markdown = $convertToMarkdownString(PLAYGROUND_TRANSFORMERS);
              resolve(markdown);
            });
          });
        },

        // Check if editor is empty
        isEmpty(): Promise<boolean> {
          return new Promise((resolve) => {
            editor.getEditorState().read(() => {
              const root = $getRoot();
              const children = root.getChildren();
              if (children.length === 0) {
                resolve(true);
              } else if (children.length === 1) {
                const firstChild = children[0];
                resolve(firstChild.getTextContent().trim() === '');
              } else {
                resolve(false);
              }
            });
          });
        },

        // Get word count
        getWordCount(): Promise<number> {
          return new Promise((resolve) => {
            editor.getEditorState().read(() => {
              const root = $getRoot();
              const text = root.getTextContent();
              const words = text.trim().split(/\s+/).filter(word => word.length > 0);
              resolve(words.length);
            });
          });
        },

        // Get character count
        getCharacterCount(): Promise<number> {
          return new Promise((resolve) => {
            editor.getEditorState().read(() => {
              const root = $getRoot();
              resolve(root.getTextContent().length);
            });
          });
        },

        // Check if editor is editable
        isEditable(): Promise<boolean> {
          return Promise.resolve(editor.isEditable());
        },

        // Set editable state
        setEditable(editable: boolean): Promise<boolean> {
          editor.setEditable(editable);
          return Promise.resolve(true);
        },
      },
    });

    let remote: any = null;

    connection.promise
      .then((r) => {
        remote = r;
        console.log('[PenpalPlugin] ✅ Connection established');
        
        // Notify parent that iframe is ready
        if (remote.onReady) {
          remote.onReady().catch((err: Error) => {
            console.error('[PenpalPlugin] Error calling onReady:', err);
          });
        }
      })
      .catch((error) => {
        console.error('[PenpalPlugin] ❌ Connection failed:', error);
      });

    // Listen to editor changes and notify parent
    const removeUpdateListener = editor.registerUpdateListener(
      ({editorState}) => {
        if (isUpdatingFromParent || !remote) return;

        editorState.read(() => {
          const root = $getRoot();
          const textContent = root.getTextContent();

          if (remote.onContentChange) {
            remote.onContentChange(textContent).catch((err: Error) => {
              console.error('[PenpalPlugin] Error calling onContentChange:', err);
            });
          }
        });
      },
    );

    return () => {
      removeUpdateListener();
      document.body.classList.remove('iframe-mode', 'minimal', 'clean');
      if (connection && typeof connection.destroy === 'function') {
        connection.destroy();
      }
    };
  }, [editor]);

  return null;
}

