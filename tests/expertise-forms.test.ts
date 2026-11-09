import assert from "node:assert/strict";
import test, { mock } from "node:test";
import * as React from "react";

test("formulir mengganti opsi berdasarkan ID prodi dan mereset pilihan stale", async (t) => {
  let cursor = 0;
  let states: unknown[] = [];
  const reactMock = mock.module("react", { exports: {
    ...React,
    useState: (initial: unknown) => {
      const index = cursor++;
      if (index >= states.length) states.push(initial);
      return [states[index], (next: unknown) => { states[index] = typeof next === "function" ? next(states[index]) : next; }];
    },
  } });
  const submit = mock.fn();
  const actionsMock = mock.module("../src/app/actions/accounts", { exports: {
    accountAction: submit, finishReset: submit, register: submit, requestReset: submit,
  } });
  t.after(() => { reactMock.restore(); actionsMock.restore(); });
  const { RegistrationForm, ProfileFields, ExpertiseFields, ProgramSelect } = await import("../src/components/account-forms");
  const options = [
    { id: "9007199254740993", namaBidang: "Data", programStudiId: "1" },
    { id: "2", namaBidang: "Jaringan", programStudiId: "1" },
    { id: "3", namaBidang: "Data", programStudiId: "2" },
  ];
  const programs = [{ id: "1", label: "Fakultas A / Informatika" }, { id: "2", label: "Fakultas B / Informatika" }];
  function elements(node: React.ReactNode): React.ReactElement<Record<string, unknown>>[] {
    if (Array.isArray(node)) return node.flatMap(elements);
    if (!React.isValidElement<Record<string, unknown>>(node)) return [];
    return [node, ...elements(node.props.children as React.ReactNode)];
  }
  const ids = (field: React.ReactElement<Record<string, unknown>>) => (field.props.options as typeof options).map((f) => f.id);
  const renderRegistration = () => { cursor = 0; return elements(RegistrationForm({ options, programs })); };
  let tree = renderRegistration();
  const role = tree.find((e) => e.type === "select" && e.props.name === "role")!;
  (role.props.onChange as (event: { target: { value: string } }) => void)({ target: { value: "dosen" } });
  tree = renderRegistration();
  assert.deepEqual(ids(tree.find((e) => e.type === ExpertiseFields)!), []);
  (tree.find((e) => e.type === ProgramSelect)!.props.onChange as (id: string) => void)("1");
  tree = renderRegistration();
  const first = tree.find((e) => e.type === ExpertiseFields)!;
  assert.deepEqual(ids(first), ["9007199254740993", "2"]);
  (tree.find((e) => e.type === ProgramSelect)!.props.onChange as (id: string) => void)("2");
  tree = renderRegistration();
  const next = tree.find((e) => e.type === ExpertiseFields)!;
  assert.deepEqual(ids(next), ["3"]); assert.notEqual(first.key, next.key);

  states = [];
  const values = { nama: "Dosen", email: "dosen@example.invalid", programStudiId: "1", bidang: ["9007199254740993", "2"] };
  const renderProfile = () => { cursor = 0; return elements(ProfileFields({ options, programs, values })); };
  tree = renderProfile();
  assert.deepEqual(tree.find((e) => e.type === ExpertiseFields)!.props.selected, values.bidang);
  const affiliation = tree.find((e) => e.type === "input" && e.props.value === "programStudiId")!;
  (affiliation.props.onChange as (event: { target: { checked: boolean } }) => void)({ target: { checked: true } });
  tree = renderProfile();
  (tree.find((e) => e.type === ProgramSelect)!.props.onChange as (id: string) => void)("2");
  tree = renderProfile();
  assert.deepEqual(ids(tree.find((e) => e.type === ExpertiseFields)!), ["3"]);
  assert.deepEqual(tree.find((e) => e.type === ExpertiseFields)!.props.selected, []);
  const changed = tree.find((e) => e.type === "input" && e.props.value === "programStudiId")!;
  (changed.props.onChange as (event: { target: { checked: boolean } }) => void)({ target: { checked: false } });
  tree = renderProfile();
  assert.deepEqual(ids(tree.find((e) => e.type === ExpertiseFields)!), ["9007199254740993", "2"]);
  assert.deepEqual(tree.find((e) => e.type === ExpertiseFields)!.props.selected, []);
});
