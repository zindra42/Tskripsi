import assert from "node:assert/strict";
import test, { mock } from "node:test";
import * as React from "react";
import type { AccountFormState } from "../src/app/actions/accounts";

test("formulir rahasia mengunci submit setelah sukses dan tetap terkunci setelah rahasia disembunyikan", async (t) => {
  let state: AccountFormState = { error: "" };
  let pending = false;
  let hidden: string | undefined;
  const submit = mock.fn();
  // Synthetic hooks inspect the actual component tree without a browser or DOM renderer.
  const reactMock = mock.module("react", { exports: {
    ...React,
    useActionState: () => [state, submit, pending],
    useState: () => [hidden, (value: string) => { hidden = value; }],
  } });
  const actionsMock = mock.module("../src/app/actions/accounts", { exports: {
    accountAction: submit, finishReset: submit, register: submit, requestReset: submit,
  } });
  t.after(() => { reactMock.restore(); actionsMock.restore(); });
  const { ActionForm } = await import("../src/components/account-forms");

  function elements(node: React.ReactNode): React.ReactElement<Record<string, unknown>>[] {
    if (Array.isArray(node)) return node.flatMap(elements);
    if (!React.isValidElement<Record<string, unknown>>(node)) return [];
    return [node, ...elements(node.props.children as React.ReactNode)];
  }

  function render() {
    const tree = elements(ActionForm({ command: "approve-reset", children: null }));
    const button = tree.find((element) => element.type === "button" && element.props.type === "submit")!;
    const fieldset = tree.find((element) => element.type === "fieldset")!;
    return { tree, button, fieldset };
  }

  assert.equal(render().button.props.disabled, false);
  pending = true;
  assert.equal(render().button.props.disabled, true);
  pending = false;
  state = { error: "", success: "Perubahan berhasil disimpan.", secret: "a".repeat(64) };
  const approved = render();
  assert.equal(approved.fieldset.props.disabled, true);
  assert.equal(approved.button.props.disabled, true);
  assert.equal(approved.tree.find((element) => element.type === "code")?.props.children, state.secret);

  // A second native submit attempt is blocked by the disabled submit control.
  if (!approved.button.props.disabled) submit();
  assert.equal(submit.mock.callCount(), 0);
  assert.equal(render().tree.find((element) => element.type === "code")?.props.children, state.secret);
  const hide = approved.tree.find((element) => element.type === "button" && element.props.type === "button")!;
  (hide.props.onClick as () => void)();
  assert.ok(!render().tree.some((element) => element.type === "code"));
  assert.equal(render().button.props.disabled, true);
  assert.equal(render().fieldset.props.disabled, true);
});
