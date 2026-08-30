import { describe, it, after } from "node:test";
import assert from "node:assert/strict";
import {
  listLibrarySpaces,
  createLibrarySpace,
  updateLibrarySpace,
  deleteLibrarySpace,
  getLibrarySpace,
} from "../librarySpace.service.js";
import {
  createLibraryVolume,
  listLibraryVolumes,
  deleteLibraryVolume,
} from "../libraryVolume.service.js";

describe("Library Spaces & Multi-Library Management Engine", () => {
  const createdSpaceIds: string[] = [];
  const createdVolumeIds: string[] = [];

  after(async () => {
    // Clean up all test volumes
    for (const volId of createdVolumeIds) {
      try {
        await deleteLibraryVolume(volId);
      } catch {}
    }
    // Clean up all test spaces
    for (const spaceId of createdSpaceIds) {
      try {
        await deleteLibrarySpace(spaceId);
      } catch {}
    }
  });

  it("ensures default library space exists", async () => {
    const spaces = await listLibrarySpaces();
    assert.ok(spaces.length >= 1, "Should have at least 1 default library space");
    const defaultSpace = spaces.find((s) => s.isDefault);
    assert.ok(defaultSpace, "Should have a designated default library");
  });

  it("creates a new secondary library space", async () => {
    const space = await createLibrarySpace({
      name: "Temporary Test Library Space",
      location: "Suite 400, 4th Floor",
      description: "Legal reference, taxation, and jurisprudence library",
      icon: "🏢",
      color: "#0ea5e9",
    });

    createdSpaceIds.push(space.id);
    assert.ok(space.id);
    assert.equal(space.name, "Temporary Test Library Space");
    assert.equal(space.location, "Suite 400, 4th Floor");
    assert.equal(space.volumeCount, 0);

    // Fetch single
    const fetched = await getLibrarySpace(space.id);
    assert.ok(fetched);
    assert.equal(fetched.name, "Temporary Test Library Space");
  });

  it("intakes books specifically into the space and isolates catalog search", async () => {
    const spaceId = createdSpaceIds[0];
    assert.ok(spaceId, "Space ID should exist");

    // Create volume in test library
    const volume = await createLibraryVolume({
      isbn: "9780316769488",
      title: "Temporary Test Catcher",
      author: "J.D. Salinger",
      librarySpaceId: spaceId,
      replacementValue: 45.0,
      condition: "FINE",
    });

    createdVolumeIds.push(volume.id);
    assert.ok(volume.id);
    assert.equal(volume.librarySpaceId, spaceId);

    // List volumes filtered by this space
    const filtered = await listLibraryVolumes({ librarySpaceId: spaceId });
    assert.ok(filtered.items.some((v) => v.id === volume.id));

    // Check space stats update
    const updatedSpace = await getLibrarySpace(spaceId);
    assert.ok(updatedSpace);
    assert.ok(updatedSpace.volumeCount >= 1);
    assert.ok(updatedSpace.totalValue >= 45.0);
  });

  it("updates library space metadata", async () => {
    const spaceId = createdSpaceIds[0];
    if (!spaceId) return;

    const updated = await updateLibrarySpace(spaceId, {
      name: "Updated Temporary Test Space",
      description: "Expanded collection",
    });

    assert.equal(updated.name, "Updated Temporary Test Space");
    assert.equal(updated.description, "Expanded collection");
  });

  it("deletes a secondary library space and moves volumes to default library", async () => {
    // Create temporary space
    const temp = await createLibrarySpace({
      name: "Temporary Cabin Space For Delete Test",
      icon: "🏡",
    });

    // Add a book to it
    const tempVol = await createLibraryVolume({
      isbn: "9780141439518",
      title: "Temporary Test Volume For Delete",
      librarySpaceId: temp.id,
      replacementValue: 15.0,
    });
    createdVolumeIds.push(tempVol.id);

    // Delete temporary space
    const res = await deleteLibrarySpace(temp.id);
    assert.equal(res.success, true);
    assert.ok(res.movedToDefaultId);

    // Verify book was moved to default library space
    const movedVolumes = await listLibraryVolumes({ librarySpaceId: res.movedToDefaultId });
    assert.ok(movedVolumes.items.some((v) => v.id === tempVol.id));
  });
});
